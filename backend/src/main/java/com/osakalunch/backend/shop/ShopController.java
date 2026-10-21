package com.osakalunch.backend.shop;

import com.osakalunch.backend.i18n.I18nController;
import com.osakalunch.backend.i18n.Translator;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Duration;
import java.util.regex.Pattern;

/**
 * 결과 카드의 가게 소개 번역 (10/22 결정: 지금 AI 번역으로 보여 주기). 익명 로그인 토큰이 있어야 함
 */
@RestController
public class ShopController {

    static final Pattern SHOP_ID = Pattern.compile("[A-Za-z0-9]{1,40}");

    private final ShopCatchService service;

    public ShopController(ShopCatchService service) {
        this.service = service;
    }

    public record CatchResponse(String shopId, String lang, String text) {
    }

    /** 소개가 없는 가게는 204. 일본어는 원문 그대로라 400 */
    @GetMapping("/api/shops/{shopId}/catch")
    public ResponseEntity<CatchResponse> translatedCatch(@PathVariable String shopId, @RequestParam String lang) {
        if (!SHOP_ID.matcher(shopId).matches() || "ja".equals(lang) || !I18nController.supportedLanguage(lang)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "가게 id나 언어 코드가 맞지 않아요");
        }
        try {
            String text = service.get(shopId, lang);
            if (text == null) return ResponseEntity.noContent().build();
            return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(6)).cachePrivate())
                    .body(new CatchResponse(shopId, lang, text));
        } catch (Translator.TranslationFailed | IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "번역하지 못했어요");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
}
