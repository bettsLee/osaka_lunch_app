package com.osakalunch.backend.i18n;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 언어별 번역본: 저장된 게 있으면 그대로, 없으면 Gemini로 한 번 번역해 저장 (원문 버전마다 한 번)
 */
@Service
public class TranslationService {

    private static final Logger log = LoggerFactory.getLogger(TranslationService.class);
    static final int MAX_PER_HOUR = 20; // 새 번역은 시간당 이만큼만 (누가 언어 코드를 바꿔 가며 불러도 비용이 늘지 않게)

    public record Result(String lang, String version, Map<String, String> messages) {
    }

    private final TranslationRepository translations;
    private final SourceCatalog source;
    private final Translator translator;
    private final ObjectMapper json;
    private final Deque<Instant> recent = new ArrayDeque<>();

    public TranslationService(TranslationRepository translations, SourceCatalog source, Translator translator, ObjectMapper json) {
        this.translations = translations;
        this.source = source;
        this.translator = translator;
        this.json = json;
    }

    public Result get(String lang) throws IOException, InterruptedException {
        SourceCatalog.Source src = source.current();
        String id = Translation.key(lang, src.version());
        var saved = translations.findById(id);
        if (saved.isPresent()) return result(lang, saved.get());
        if (!translator.ready()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "번역 설정(GEMINI_API_KEY)이 없어요");
        // 한 번에 한 언어씩: 같은 언어를 동시에 두 번 번역하지 않게
        synchronized (this) {
            saved = translations.findById(id);
            if (saved.isPresent()) return result(lang, saved.get());
            Instant now = Instant.now();
            while (!recent.isEmpty() && recent.peekFirst().isBefore(now.minus(Duration.ofHours(1)))) recent.pollFirst();
            if (recent.size() >= MAX_PER_HOUR) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
            recent.addLast(now);
            Map<String, String> messages = translator.translate(src.messages(), lang);
            translations.save(new Translation(lang, src.version(), json.writeValueAsString(messages), translator.model(), now));
            log.info("새 번역 저장: {} (원문 {})", lang, src.version());
            return new Result(lang, src.version(), messages);
        }
    }

    private Result result(String lang, Translation t) throws IOException {
        Map<String, String> messages = json.readValue(t.getMessages(), new TypeReference<LinkedHashMap<String, String>>() {
        });
        return new Result(lang, t.getVersion(), messages);
    }
}
