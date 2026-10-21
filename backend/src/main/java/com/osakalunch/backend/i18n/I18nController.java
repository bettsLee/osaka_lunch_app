package com.osakalunch.backend.i18n;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 휴대폰 언어 문구 (한국어 · 영어는 화면에 들어 있어서 그 밖의 언어만). 로그인 없이 부름
 */
@RestController
public class I18nController {

    static final Pattern LANG = Pattern.compile("[a-z]{2,3}(-Han[st])?"); // vi, fil, zh-Hans, zh-Hant
    static final Set<String> BUNDLED = Set.of("ko", "en");

    private final TranslationService service;

    public I18nController(TranslationService service) {
        this.service = service;
    }

    @GetMapping("/api/i18n/{lang}")
    public ResponseEntity<TranslationService.Result> get(@PathVariable String lang) {
        if (!LANG.matcher(lang).matches() || BUNDLED.contains(lang) || !knownLanguage(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "지원하지 않는 언어 코드예요");
        }
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic()).body(service.get(lang));
        } catch (Translator.TranslationFailed | IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "번역하지 못했어요");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    /** Java가 이름을 아는 언어만 (xx 같은 코드는 이름이 코드 그대로 나옴) */
    static boolean knownLanguage(String lang) {
        String base = lang.split("-")[0];
        String name = Locale.forLanguageTag(base).getDisplayLanguage(Locale.ENGLISH);
        return !name.isBlank() && !name.equalsIgnoreCase(base);
    }
}
