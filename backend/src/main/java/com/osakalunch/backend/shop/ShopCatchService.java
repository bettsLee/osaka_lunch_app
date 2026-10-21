package com.osakalunch.backend.shop;

import com.osakalunch.backend.i18n.Translator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HexFormat;
import java.util.List;

/**
 * 가게 소개(핫페퍼 catch)를 휴대폰 언어로: 저장된 게 있고 원문이 같으면 그대로, 아니면 Gemini로 한 번 번역해 저장
 * 원문은 수집 배치가 매일 채우는 shops 표에서 읽음 (화면이 보낸 글은 번역하지 않음)
 */
@Service
public class ShopCatchService {

    private static final Logger log = LoggerFactory.getLogger(ShopCatchService.class);
    static final int MAX_PER_HOUR = 300; // 새 번역은 시간당 이만큼만 (가게 하나에 1센트도 안 들지만 누가 계속 불러도 비용이 늘지 않게)

    private final JdbcTemplate jdbc;
    private final ShopTranslationRepository translations;
    private final Translator translator;
    private final Deque<Instant> recent = new ArrayDeque<>();

    public ShopCatchService(JdbcTemplate jdbc, ShopTranslationRepository translations, Translator translator) {
        this.jdbc = jdbc;
        this.translations = translations;
        this.translator = translator;
    }

    /** 번역한 소개. 가게가 없거나 소개가 비어 있으면 null */
    public String get(String shopId, String lang) throws IOException, InterruptedException {
        List<String> found = jdbc.queryForList("select catch from shops where id = ?", String.class, shopId);
        String source = found.isEmpty() ? null : found.get(0);
        if (source == null || source.isBlank()) return null;
        String hash = hash(source);
        var saved = translations.findById(ShopTranslation.key(shopId, lang));
        if (saved.isPresent() && saved.get().getSourceHash().equals(hash)) return saved.get().getText();
        if (!translator.ready()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "번역 설정(GEMINI_API_KEY)이 없어요");
        synchronized (this) {
            Instant now = Instant.now();
            while (!recent.isEmpty() && recent.peekFirst().isBefore(now.minus(Duration.ofHours(1)))) recent.pollFirst();
            if (recent.size() >= MAX_PER_HOUR) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
            recent.addLast(now);
        }
        String text = translator.translateShopText(source, lang);
        ShopTranslation row = saved.orElseGet(() -> new ShopTranslation(shopId, lang, hash, text, translator.model(), Instant.now()));
        row.update(hash, text, translator.model(), Instant.now());
        translations.save(row);
        log.info("가게 소개 번역 저장: {} ({})", shopId, lang);
        return text;
    }

    static String hash(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d).substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
