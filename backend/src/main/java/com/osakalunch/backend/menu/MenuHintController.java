package com.osakalunch.backend.menu;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * 결과 카드의 대표 메뉴 (11/17 결정, OL-65). 익명 로그인 필요 (봇 · 1초 만에 나간 기기는 부르지 못함)
 * 구글 지도 그라운딩은 Gemini 3 이상에서 월 5,000회까지 무료라 하루 한도를 넘으면 묻지 않고 unavailable (화면은 구글맵 링크)
 */
@RestController
public class MenuHintController {

    static final ZoneId OSAKA = ZoneId.of("Asia/Tokyo");

    private final ShopRepository shops;
    private final MenuHintClient client;
    private final PlacePhotosClient photos;
    private final int dailyLimit;
    private final Clock clock;
    private LocalDate day;
    private int used;

    @Autowired
    public MenuHintController(ShopRepository shops, MenuHintClient client, PlacePhotosClient photos,
                              @Value("${menu-hint.daily-limit:150}") int dailyLimit) {
        this(shops, client, photos, dailyLimit, Clock.system(OSAKA));
    }

    MenuHintController(ShopRepository shops, MenuHintClient client, PlacePhotosClient photos, int dailyLimit, Clock clock) {
        this.shops = shops;
        this.client = client;
        this.photos = photos;
        this.dailyLimit = dailyLimit;
        this.clock = clock;
    }

    @GetMapping("/api/shops/{shopId}/menu-hint")
    public ResponseEntity<MenuHint> get(@PathVariable String shopId, @RequestParam(defaultValue = "ko") String lang) {
        if (!shopId.matches("[A-Za-z0-9_-]{1,40}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        Shop shop = shops.findById(shopId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String language = lang.matches("[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?") ? lang : "ko";
        MenuHint hint = shop.getLat() == null || shop.getLng() == null || !client.ready() || !take()
                ? MenuHint.unavailable()
                : client.ask(shop, language);
        // 사진 키가 아직 없으면 가게 ID를 주지 않음 → 화면이 사진 회색 칸을 잠깐 보였다 지우지 않게
        if (!photos.ready() && hint.placeId() != null) {
            hint = new MenuHint(hint.status(), hint.place(), hint.menus(), hint.kind(), hint.sources(), null);
        }
        // 구글 지도 기반 답은 저장하면 안 돼서 브라우저 · 중간 서버도 보관하지 않게
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(hint);
    }

    /** 오사카 날짜 기준 하루 한도 (서버가 다시 시작하면 0부터. 무료 서버 한 대라 이 정도로 충분) */
    synchronized boolean take() {
        LocalDate today = LocalDate.now(clock);
        if (!today.equals(day)) {
            day = today;
            used = 0;
        }
        if (used >= dailyLimit) return false;
        used++;
        return true;
    }
}
