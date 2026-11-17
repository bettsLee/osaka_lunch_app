package com.osakalunch.backend.menu;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BooleanSupplier;

/**
 * Gemini의 '구글 지도 그라운딩'으로 가게의 대표 메뉴 · 평일 점심 영업 여부를 물음 (11/17 결정, OL-65)
 *
 * - 우리 AI가 구글 리뷰를 읽고 유추하면 구글 약관(구글 지도 콘텐츠로 콘텐츠 만들기 금지)에 걸려서, 구글이 제공하는 그라운딩을 씀
 * - 답은 저장하지 않음 (가게 ID · 리뷰 ID만 저장 가능). 그래서 카드를 볼 때마다 물어봄
 * - 11/17 오사카 10곳 실험: 생각을 줄이고(low) 4줄 형식으로 물으면 평균 3.6초 · 10곳 중 8곳 메뉴.
 *   메뉴 한 줄만 물으면 6곳, 가벼운 모델(Flash-Lite)은 1.5초지만 4곳이라 안 씀
 */
@Component
public class MenuHintClient {

    private static final Logger log = LoggerFactory.getLogger(MenuHintClient.class);
    static final String ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent";
    static final int MAX_MENUS = 3;
    static final int MAX_SOURCES = 3;
    static final Duration MIN_RETRY = Duration.ofSeconds(4); // 다시 물을 시간이 이보다 적게 남으면 그만 (11/17 진단: 다시 묻기 3~4초)

    /** 줄 이름은 영어로 고정해 읽기 쉽게, 값은 사용자 언어로. 가격 · 근거 줄은 화면에 안 쓰지만 이 형식이라야 메뉴를 더 꼼꼼히 찾음 (11/17 실험) */
    static final String PROMPT = """
            Find this restaurant on Google Maps.
            Name: %s
            Location: near latitude %s, longitude %s (Osaka, Japan)

            Answer in exactly these 5 lines and nothing else. Write the MENU, PRICE and BASIS values in %s.
            STATUS: is it open for lunch on weekdays? Exactly one of these English words: OPEN, NO_LUNCH, CLOSED (permanently closed), UNKNOWN
            KIND: LUNCH if the dishes in MENU are known to be served at weekday lunch (lunch sets, lunch menu), otherwise ALL
            MENU: 2-3 dishes, each followed by its Japanese name in parentheses, separated by " · ". Prefer dishes served at weekday lunch; if unknown, the restaurant's signature dishes. UNKNOWN if there is no basis
            PRICE: lunch price range in yen. If there is no basis for lunch, the overall price range of the place. UNKNOWN if neither
            BASIS: what you looked at (reviews, menu info, place info)
            Do not make anything up.
            """;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper json;
    private final String apiKey;
    private final String model;
    private final Duration timeout;
    private volatile boolean thinkingOption = true; // 모델이 생각 줄이기 설정을 거절하면 빼고 보냄

    public MenuHintClient(ObjectMapper json,
                          @Value("${gemini.api-key:}") String apiKey,
                          @Value("${gemini.model}") String model,
                          @Value("${menu-hint.timeout-seconds:12}") long timeoutSeconds) {
        this.json = json;
        this.apiKey = apiKey.trim();
        this.model = model;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    public boolean ready() {
        return !apiKey.isBlank();
    }

    /**
     * 묻지 못하면(시간 초과 · 오류) unavailable. 화면은 그때 구글맵 링크를 보여 줌
     * 11/17 진단: AI가 구글 지도를 아예 안 찾아보고 답하는 때가 있음(30곳 중 6곳) → 자동으로 한 번 더 물으면 6곳 중 4곳이 출처와 함께 살아남.
     * 그래도 지도를 안 본 답이면 그 메뉴를 'AI 추측'으로 보여 줌 (상권: "(나)로 해줘")
     * 다시 묻기는 전체 시간(timeout) 안에서만, 하루 한도(mayRetry)를 한 번 더 써서
     */
    public MenuHint ask(Shop shop, String lang, BooleanSupplier mayRetry) {
        long started = System.nanoTime();
        MenuHint fallback = MenuHint.unavailable();
        for (int attempt = 1; attempt <= 2; attempt++) {
            Duration left = timeout.minusNanos(System.nanoTime() - started);
            if (attempt == 2 && (left.compareTo(MIN_RETRY) < 0 || !mayRetry.getAsBoolean())) break;
            try {
                JsonNode cand = call(shop, lang, left).path("candidates").path(0);
                StringBuilder text = new StringBuilder();
                for (JsonNode part : cand.path("content").path("parts")) {
                    if (!part.path("thought").asBoolean(false)) text.append(part.path("text").asText(""));
                }
                JsonNode meta = cand.path("groundingMetadata");
                if (!meta.path("groundingChunks").isEmpty()) { // 구글 지도에서 찾은 답
                    MenuHint hint = parse(text.toString(), sources(meta), placeId(meta));
                    log.info("대표 메뉴 {} {} {}ms {}번째", shop.getId(), hint.status(), elapsedMs(started), attempt);
                    return hint;
                }
                MenuHint guess = guess(text.toString());
                if (!guess.menus().isEmpty() || fallback.menus().isEmpty()) fallback = guess;
            } catch (HttpTimeoutException e) {
                log.warn("대표 메뉴 시간 초과 {} {}ms {}번째", shop.getId(), elapsedMs(started), attempt);
                break; // 시간을 다 씀
            } catch (IOException e) {
                log.warn("대표 메뉴 실패 {} {}번째: {}", shop.getId(), attempt, e.getMessage());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        log.info("대표 메뉴 {} {} {}ms (지도 없이)", shop.getId(), fallback.status(), elapsedMs(started));
        return fallback;
    }

    private static long elapsedMs(long started) {
        return (System.nanoTime() - started) / 1_000_000;
    }

    JsonNode call(Shop shop, String lang, Duration timeout) throws IOException, InterruptedException {
        for (int attempt = 0; attempt < 2; attempt++) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", prompt(shop, lang))))));
            body.put("tools", List.of(Map.of("googleMaps", Map.of())));
            body.put("toolConfig", Map.of("retrievalConfig",
                    Map.of("latLng", Map.of("latitude", shop.getLat(), "longitude", shop.getLng()))));
            Map<String, Object> generation = new LinkedHashMap<>();
            generation.put("maxOutputTokens", 400);
            if (thinkingOption) generation.put("thinkingConfig", Map.of("thinkingLevel", "low")); // 10초 → 3~4초 (11/17 실험)
            body.put("generationConfig", generation);
            HttpRequest req = HttpRequest.newBuilder(URI.create(ENDPOINT.formatted(model)))
                    .timeout(timeout)
                    .header("x-goog-api-key", apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body)))
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 400 && thinkingOption && res.body().contains("thinking")) {
                thinkingOption = false;
                continue;
            }
            if (res.statusCode() != 200) throw new IOException("Gemini 오류 " + res.statusCode());
            return json.readTree(res.body());
        }
        throw new IOException("Gemini가 요청 형식을 받지 않아요");
    }

    static String prompt(Shop shop, String lang) {
        String language = Locale.forLanguageTag(lang).getDisplayName(Locale.ENGLISH) + " (" + lang + ")";
        return PROMPT.formatted(shop.getName(), shop.getLat(), shop.getLng(), language);
    }

    /** groundingChunks의 구글 지도 장소 (같은 주소는 하나로) */
    static List<MenuHint.Source> sources(JsonNode metadata) {
        Map<String, MenuHint.Source> out = new LinkedHashMap<>();
        for (JsonNode chunk : metadata.path("groundingChunks")) {
            JsonNode maps = chunk.path("maps");
            String uri = maps.path("uri").asText("");
            String title = maps.path("title").asText("");
            if (uri.startsWith("https://") && !title.isBlank() && out.size() < MAX_SOURCES) {
                out.putIfAbsent(uri, new MenuHint.Source(title, uri));
            }
        }
        return List.copyOf(out.values());
    }

    /** 첫 번째 구글 지도 장소의 가게 ID ('places/ChIJ…' 이면 앞부분을 뗌). 사진을 받을 때 씀 */
    static String placeId(JsonNode metadata) {
        for (JsonNode chunk : metadata.path("groundingChunks")) {
            String id = chunk.path("maps").path("placeId").asText("").replaceFirst("^places/", "");
            if (id.matches("[A-Za-z0-9_-]{10,300}")) return id;
        }
        return null;
    }

    /** 'STATUS: …' · 'KIND: …' · 'MENU: …' 줄을 읽음. 출처가 없으면 구글 지도에서 찾은 답이 아니라서 메뉴를 쓰지 않음 */
    static MenuHint parse(String text, List<MenuHint.Source> sources, String placeId) {
        String[] l = lines(text);
        List<String> menus = sources.isEmpty() ? List.of() : menus(l[2]);
        return new MenuHint(menus.isEmpty() ? "unknown" : "ok", place(l[0]), menus, kind(l[1]), sources, sources.isEmpty() ? null : placeId);
    }

    /** 구글 지도를 안 찾아보고 쓴 답: 메뉴가 있으면 'AI 추측'(guess). 지도로 확인한 게 아니라 영업 여부는 쓰지 않음 */
    static MenuHint guess(String text) {
        String[] l = lines(text);
        List<String> menus = menus(l[2]);
        return new MenuHint(menus.isEmpty() ? "unknown" : "guess", "unknown", menus, kind(l[1]), List.of(), null);
    }

    /** [STATUS, KIND, MENU] 값 */
    private static String[] lines(String text) {
        String[] out = {"", "", ""};
        for (String raw : text.split("\\R")) {
            String line = raw.strip().replaceFirst("^[*\\-•\\s]+", "").replace("**", "");
            String head = line.toUpperCase(Locale.ROOT);
            if (head.startsWith("STATUS")) out[0] = value(line);
            else if (head.startsWith("KIND")) out[1] = value(line);
            else if (head.startsWith("MENU")) out[2] = value(line);
        }
        return out;
    }

    private static String kind(String kind) {
        return kind.toUpperCase(Locale.ROOT).startsWith("LUNCH") ? "lunch" : "signature"; // 모르면 '가게 대표 메뉴'로
    }

    static String place(String status) {
        String s = status.toUpperCase(Locale.ROOT);
        if (s.contains("CLOSED")) return "closed";
        if (s.contains("NO_LUNCH") || s.contains("NO LUNCH")) return "no_lunch";
        if (s.startsWith("OPEN")) return "open";
        return "unknown";
    }

    static List<String> menus(String menu) {
        if (menu.isBlank() || menu.toUpperCase(Locale.ROOT).startsWith("UNKNOWN")) return List.of();
        List<String> out = new ArrayList<>();
        // ' · ' 또는 쉼표로 나눔. 일본어 이름 안의 '・'는 나누지 않음
        for (String item : menu.split("\\s*·\\s*|,\\s*|、")) {
            String m = item.strip().replaceAll("[.。]+$", "");
            if (!m.isEmpty() && m.length() <= 60 && out.size() < MAX_MENUS) out.add(m);
        }
        return out;
    }

    private static String value(String line) {
        int colon = Math.max(line.indexOf(':'), line.indexOf('：'));
        return colon < 0 ? "" : line.substring(colon + 1).strip();
    }
}
