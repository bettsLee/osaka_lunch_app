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
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * 결과 카드의 손님 사진 (11/17 상권: "메뉴사진도 같이 넣을 수 없어? 이게 제일 중요한 거 같은데", 가안)
 * 구글 장소 API (New): 장소 세부정보(photos만 → Essentials IDs Only) + 사진 주소(Place Details Photos, 월 1,000장 무료 · 1,000장당 7달러)
 *
 * - 사진 이름 · 주소는 저장하지 않음 (약관 3.2.3(b): 사진 이름은 캐시 불가). 볼 때마다 받음
 * - 사진마다 올린 사람(authorAttributions)을 함께 돌려줌 → 화면에 표시 (구글 표시 규칙)
 * - 키(GOOGLE_PLACES_API_KEY)가 없으면 빈 목록 → 화면은 사진 줄을 숨김
 */
@Component
public class PlacePhotosClient {

    private static final Logger log = LoggerFactory.getLogger(PlacePhotosClient.class);
    static final String DETAILS = "https://places.googleapis.com/v1/places/%s";
    static final String MEDIA = "https://places.googleapis.com/v1/%s/media?maxWidthPx=%d&skipHttpRedirect=true";
    static final int MAX_WIDTH = 480; // 카드 썸네일(약 120px) · 화면 배율 3까지 선명하게

    public record Photo(String url, String author, String authorUri) {
    }

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper json;
    private final String apiKey;

    public PlacePhotosClient(ObjectMapper json, @Value("${google.places.api-key:}") String apiKey) {
        this.json = json;
        this.apiKey = apiKey.trim();
    }

    public boolean ready() {
        return !apiKey.isBlank();
    }

    /** 가게 사진 최대 count장. 실패하면 빈 목록 (화면은 사진 줄만 숨김) */
    public List<Photo> photos(String placeId, int count) {
        long started = System.nanoTime();
        try {
            HttpResponse<String> res = http.send(get(DETAILS.formatted(placeId)).header("X-Goog-FieldMask", "photos").build(),
                    HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) throw new IOException("장소 세부정보 " + res.statusCode());
            List<JsonNode> picked = new ArrayList<>();
            for (JsonNode p : json.readTree(res.body()).path("photos")) {
                if (picked.size() < count && p.path("name").asText("").startsWith("places/")) picked.add(p);
            }
            // 사진 주소는 한꺼번에 받음 (한 장씩이면 장마다 0.3~0.5초)
            List<CompletableFuture<Photo>> pending = new ArrayList<>();
            for (JsonNode p : picked) pending.add(media(p));
            List<Photo> out = new ArrayList<>();
            for (CompletableFuture<Photo> f : pending) {
                Photo photo = f.join();
                if (photo != null) out.add(photo);
            }
            log.info("손님 사진 {}장 {}ms", out.size(), (System.nanoTime() - started) / 1_000_000);
            return out;
        } catch (IOException e) {
            log.warn("손님 사진 실패: {}", e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return List.of();
    }

    private CompletableFuture<Photo> media(JsonNode photo) {
        JsonNode author = photo.path("authorAttributions").path(0);
        return http.sendAsync(get(MEDIA.formatted(photo.path("name").asText(), MAX_WIDTH)).build(), HttpResponse.BodyHandlers.ofString())
                .thenApply(res -> {
                    if (res.statusCode() != 200) return null;
                    try {
                        String url = json.readTree(res.body()).path("photoUri").asText("");
                        if (!url.startsWith("https://")) return null;
                        return new Photo(url, author.path("displayName").asText(""), safeUri(author.path("uri").asText("")));
                    } catch (IOException e) {
                        return null;
                    }
                })
                .exceptionally(e -> null);
    }

    private HttpRequest.Builder get(String url) {
        return HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(8)).header("X-Goog-Api-Key", apiKey).GET();
    }

    static String safeUri(String uri) {
        return uri.startsWith("https://") ? uri : "";
    }
}
