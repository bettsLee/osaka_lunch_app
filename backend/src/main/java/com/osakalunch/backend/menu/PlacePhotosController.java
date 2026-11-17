package com.osakalunch.backend.menu;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/**
 * 결과 카드의 손님 사진 (11/17, OL-66). 가게 ID는 대표 메뉴 답(구글 지도 그라운딩)에서 받은 값. 익명 로그인 필요
 * 사진 주소 요청은 월 1,000장까지 무료라 하루 장 수 한도(기본 33장 ≈ 월 1,000장)를 넘으면 빈 목록 (화면은 사진 줄을 숨김)
 */
@RestController
public class PlacePhotosController {

    static final int PER_CARD = 3;

    public record Photos(List<PlacePhotosClient.Photo> photos) {
    }

    private final PlacePhotosClient client;
    private final int dailyLimit;
    private final Clock clock;
    private LocalDate day;
    private int used;

    @Autowired
    public PlacePhotosController(PlacePhotosClient client, @Value("${google.places.photos-daily-limit:33}") int dailyLimit) {
        this(client, dailyLimit, Clock.system(MenuHintController.OSAKA));
    }

    PlacePhotosController(PlacePhotosClient client, int dailyLimit, Clock clock) {
        this.client = client;
        this.dailyLimit = dailyLimit;
        this.clock = clock;
    }

    @GetMapping("/api/places/{placeId}/photos")
    public ResponseEntity<Photos> get(@PathVariable String placeId) {
        if (!placeId.matches("[A-Za-z0-9_-]{10,300}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        int count = client.ready() ? take(PER_CARD) : 0;
        List<PlacePhotosClient.Photo> photos = count == 0 ? List.of() : client.photos(placeId, count);
        // 구글 장소 사진 주소는 저장하면 안 돼서 브라우저 · 중간 서버도 보관하지 않게
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Photos(photos));
    }

    /** 오늘 남은 장 수 안에서 최대 want장 (오사카 날짜 기준, 서버가 다시 시작하면 0부터) */
    synchronized int take(int want) {
        LocalDate today = LocalDate.now(clock);
        if (!today.equals(day)) {
            day = today;
            used = 0;
        }
        int n = Math.max(0, Math.min(want, dailyLimit - used));
        used += n;
        return n;
    }
}
