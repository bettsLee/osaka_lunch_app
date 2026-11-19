package com.osakalunch.backend.i18n;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Gemini로 앱 문구를 한 언어로 번역. 키 · {자리}가 원문과 다르면 쓰지 않음 (한 번 더 시도)
 * 11/19: 문구가 342개로 늘어 한 번에 보내면 시간 초과 · 한 줄만 틀려도 전체가 버려져 화면이 영어로 남음 (대만 휴대폰)
 *   → 60개씩 나눠 3개씩 동시에 묻고, 틀린 줄만 다시 물음. 90% 넘게 번역되면 씀 (빠진 줄은 화면이 영어로 채움)
 * 요청 형식은 수집 배치(batch/ai_structure.py)와 같음: 지금 방식이 거절되면 이전 방식으로
 */
@Component
public class Translator {

    public static class TranslationFailed extends RuntimeException {
        TranslationFailed(String message) {
            super(message);
        }
    }

    static final String ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{(\\w+)}");
    private static final List<Map<String, Object>> FORMATS = List.<Map<String, Object>>of(
            Map.of("responseFormat", Map.of("text", Map.of("mimeType", "APPLICATION_JSON"))),
            Map.of("responseMimeType", "application/json"));

    /** 지시문을 고치면 올림. 저장된 번역은 원문 버전 + 이 값으로 찾아서, 올리면 언어마다 다시 번역함 */
    public static final String PROMPT_VERSION = "2";

    static final String PROMPT = """
            You translate the UI text of a mobile web app that helps foreigners living in Osaka quickly pick a nearby lunch spot that costs ¥990 or less.
            Translate every value of the JSON object below from Korean into %s.
            Rules:
            - Return one JSON object with exactly the same keys. Translate the values only.
            - Keep every {placeholder} exactly as written, braces included. Never translate or drop one.
            - 엔 means Japanese yen. Write prices the way readers of this language usually write yen, around the number placeholder.
            - 이하 means "or less": the amount itself is included (≤). Translate "{limit}엔 이하" as "¥{limit} or less" or "up to ¥{limit}" in this language, never as "under", "below" or "less than" (a ¥990 lunch must still fit a ¥990 limit).
            - Keep the names Hot Pepper (a Japanese restaurant guide) and Google Maps.
            - Keys starting with "area." are Osaka districts (Umeda, Fukushima, Honmachi, Tenma, Namba, Kujo): write each name the way it is usually written in this language.
            - Keys starting with "genre." are restaurant categories.
            - "order.1" to "order.3" are the meanings of Japanese phrases a customer shows to restaurant staff: translate the meaning naturally.
            - Keep it short, friendly and natural, like a well-made app, in the same polite but plain tone as the Korean.
            JSON:
            %s
            """;

    /** 결과 카드의 가게 소개 (10/22 결정). 핫페퍼 글이라 뜻만 옮기고 덧붙이지 않음 */
    static final String SHOP_PROMPT = """
            Translate this short Japanese catchphrase from a restaurant's listing on Hot Pepper (a Japanese restaurant guide) into %s.
            Rules:
            - Keep the meaning only. Do not add, explain or leave out information. Keep it about as short as the original.
            - Keep restaurant names as they are. Write yen prices the way readers of this language usually write them.
            - Return one JSON object: {"text": "<translation>"}
            Japanese:
            %s
            """;

    static final int CHUNK = 60;          // 한 번에 묻는 문구 수
    static final int PARALLEL = 3;        // 동시에 묻는 묶음 수
    static final double MIN_DONE = 0.9;   // 이보다 적게 번역되면 실패 (저장하지 않음)
    static final Duration CALL_TIMEOUT = Duration.ofSeconds(60);

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private volatile boolean thinkingOption = true; // 모델이 생각 줄이기 설정을 거절하면 빼고 보냄 (MenuHintClient와 같음)
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;
    private volatile int format = 0;

    public Translator(ObjectMapper json, @Value("${gemini.api-key:}") String apiKey, @Value("${gemini.model}") String model) {
        this.json = json;
        this.apiKey = apiKey.trim();
        this.model = model;
    }

    public boolean ready() {
        return !apiKey.isBlank();
    }

    public String model() {
        return model;
    }

    /** 문구를 CHUNK개씩 나눠 번역해 원문 순서대로 돌려줌. 끝내 틀린 줄은 빠짐 (MIN_DONE 미만이면 실패) */
    public Map<String, String> translate(Map<String, String> source, String lang) throws IOException, InterruptedException {
        List<Map<String, String>> chunks = new ArrayList<>();
        for (var e : source.entrySet()) {
            if (chunks.isEmpty() || chunks.get(chunks.size() - 1).size() >= CHUNK) chunks.add(new LinkedHashMap<>());
            chunks.get(chunks.size() - 1).put(e.getKey(), e.getValue());
        }
        Map<String, String> done = new LinkedHashMap<>();
        ExecutorService pool = Executors.newFixedThreadPool(Math.max(1, Math.min(PARALLEL, chunks.size())));
        try {
            List<Future<Map<String, String>>> pending = new ArrayList<>();
            for (Map<String, String> chunk : chunks) pending.add(pool.submit(() -> translateChunk(chunk, lang)));
            for (Future<Map<String, String>> f : pending) done.putAll(f.get());
        } catch (ExecutionException e) {
            throw new IOException("번역 중 오류 (" + lang + ")", e.getCause());
        } finally {
            pool.shutdownNow();
        }
        if (done.size() < source.size() * MIN_DONE) {
            throw new TranslationFailed("번역된 문구가 너무 적어요 (" + lang + " " + done.size() + "/" + source.size() + ")");
        }
        Map<String, String> ordered = new LinkedHashMap<>();
        for (String key : source.keySet()) if (done.containsKey(key)) ordered.put(key, done.get(key));
        return ordered;
    }

    /** 한 묶음: 두 번까지 묻고, 두 번째는 첫 번째에 틀린 줄만. Gemini 오류 · 시간 초과면 그 묶음은 받은 만큼만 */
    Map<String, String> translateChunk(Map<String, String> chunk, String lang) throws InterruptedException {
        Map<String, String> good = new LinkedHashMap<>();
        for (int attempt = 0; attempt < 2 && good.size() < chunk.size(); attempt++) {
            Map<String, String> todo = new LinkedHashMap<>(chunk);
            todo.keySet().removeAll(good.keySet());
            try {
                Map<String, String> out = parse(json, call(PROMPT.formatted(languageName(lang), json.writeValueAsString(todo))));
                if (out != null) good.putAll(valid(todo, out));
            } catch (IOException e) {
                // 다음 시도에서 다시 (끝내 안 되면 이 묶음은 빠지고, 전체가 MIN_DONE 미만이면 실패)
            }
        }
        return good;
    }

    /** 원문에 있는 키 중 비어 있지 않고, 터무니없이 길지 않고, {자리}가 같은 문구만 */
    static Map<String, String> valid(Map<String, String> source, Map<String, String> out) {
        Map<String, String> ok = new LinkedHashMap<>();
        for (var e : source.entrySet()) {
            String v = out.get(e.getKey());
            if (v == null || v.isBlank() || v.length() > Math.max(200, e.getValue().length() * 4)) continue;
            if (!Objects.equals(placeholders(v), placeholders(e.getValue()))) continue;
            ok.put(e.getKey(), v);
        }
        return ok;
    }

    /** 가게 소개 한 줄을 번역. 비었거나 터무니없이 길면 한 번 더 시도 */
    public String translateShopText(String japanese, String lang) throws IOException, InterruptedException {
        String prompt = SHOP_PROMPT.formatted(languageName(lang), japanese);
        for (int attempt = 0; attempt < 2; attempt++) {
            Map<String, String> out = parse(json, call(prompt));
            String text = out == null ? null : out.get("text");
            if (text != null && !text.isBlank() && text.length() <= Math.max(120, japanese.length() * 4)) return text.strip();
        }
        throw new TranslationFailed("가게 소개를 번역하지 못했어요 (" + lang + ")");
    }

    /** 예: "Vietnamese (vi)", "Chinese (Traditional) (zh-Hant)" */
    static String languageName(String lang) {
        return Locale.forLanguageTag(lang).getDisplayName(Locale.ENGLISH) + " (" + lang + ")";
    }

    /** 테스트에서 가짜 Gemini로 바꿀 수 있게 package-private */
    String call(String prompt) throws IOException, InterruptedException {
        for (int attempt = 0; attempt < 3; attempt++) {
            Map<String, Object> generation = new LinkedHashMap<>(FORMATS.get(format));
            if (thinkingOption) generation.put("thinkingConfig", Map.of("thinkingLevel", "low")); // 번역은 오래 생각할 필요 없음
            Map<String, Object> body = Map.of(
                    "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
                    "generationConfig", generation);
            HttpRequest req = HttpRequest.newBuilder(URI.create(ENDPOINT.formatted(model)))
                    .timeout(CALL_TIMEOUT)
                    .header("x-goog-api-key", apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body)))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 400 && thinkingOption && res.body().contains("thinking")) {
                thinkingOption = false;
                continue;
            }
            if (res.statusCode() == 400 && res.body().contains("response_format") && format + 1 < FORMATS.size()) {
                format++;
                continue;
            }
            if (res.statusCode() == 429 || res.statusCode() >= 500) {
                Thread.sleep(3000L * (attempt + 1));
                continue;
            }
            if (res.statusCode() != 200) throw new IOException("Gemini 오류 " + res.statusCode());
            StringBuilder text = new StringBuilder();
            for (JsonNode part : json.readTree(res.body()).path("candidates").path(0).path("content").path("parts")) {
                if (!part.path("thought").asBoolean(false)) text.append(part.path("text").asText(""));
            }
            return text.toString();
        }
        throw new IOException("Gemini가 계속 바빠요");
    }

    /** 응답 글에서 JSON 객체만 꺼냄 (```json 으로 감싸 오는 경우 포함). 문자열 값만 있는 평평한 객체가 아니면 null */
    static Map<String, String> parse(ObjectMapper json, String text) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            return json.readValue(text.substring(start, end + 1), new TypeReference<LinkedHashMap<String, String>>() {
            });
        } catch (IOException e) {
            return null;
        }
    }

    static List<String> placeholders(String s) {
        Matcher m = PLACEHOLDER.matcher(s);
        List<String> names = new ArrayList<>();
        while (m.find()) names.add(m.group(1));
        names.sort(null);
        return names;
    }
}
