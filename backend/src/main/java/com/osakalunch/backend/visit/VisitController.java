package com.osakalunch.backend.visit;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 여기 갈래요(S4) 기록 저장과 다녀왔어요?(S5) 답 저장. 사용자는 Supabase 익명 로그인 토큰의 sub로 구분
 */
@RestController
@RequestMapping("/api/visits")
public class VisitController {

    static final Duration ASK_AFTER = Duration.ofHours(1);  // '다녀왔어요?'는 여기 갈래요 1시간 뒤부터 물음 (PRD: 1~2시간 뒤)
    static final Duration ASK_WITHIN = Duration.ofDays(3);  // 3일이 지난 기록은 묻지도 받지도 않음
    static final Duration CLOCK_SKEW = Duration.ofMinutes(5); // 휴대폰 시계가 조금 빠른 경우

    private final VisitRepository visits;

    public VisitController(VisitRepository visits) {
        this.visits = visits;
    }

    public record CreateRequest(
            @NotNull UUID id,
            @NotBlank @Size(max = 40) String shopId,
            @NotBlank @Size(max = 200) String shopName,
            @NotNull @Pattern(regexp = "roulette|list") String source,
            @PositiveOrZero Double distanceKm,
            @NotNull @Positive Integer priceLimit,
            @NotNull Instant chosenAt) {
    }

    public record FeedbackRequest(@NotNull Boolean visited, Boolean openOk, Boolean priceOk) {
    }

    /** 도착했어요. by: auto(앱을 열 때 가게 근처) · manual(버튼). openOk: 그 자리에서 영업 여부를 답했으면 */
    public record ArriveRequest(@NotNull @Pattern(regexp = "auto|manual") String by, Boolean openOk) {
    }

    /** priceLimit: 그때 고른 가격 상한. '다녀왔어요?'에서 "n엔 이하였나요?"로 물을 때 씀
     *  arrived · openOk: 도착했어요로 이미 다녀온 기록이면 질문 카드는 남은 것(가격)만 물음 */
    public record VisitResponse(UUID id, String shopId, String shopName, Integer priceLimit, Instant chosenAt,
                                boolean arrived, Boolean openOk) {
        static VisitResponse of(Visit v) {
            return new VisitResponse(v.getId(), v.getShopId(), v.getShopName(), v.getPriceLimit(), v.getChosenAt(),
                    v.getArrivedAt() != null, v.getOpenOk());
        }
    }

    /** 여기 갈래요. 화면이 실패했다가 다시 보내도(같은 id) 한 번만 저장 */
    @PostMapping
    public ResponseEntity<VisitResponse> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateRequest req) {
        UUID user = userId(jwt);
        Instant now = Instant.now();
        if (req.chosenAt().isAfter(now.plus(CLOCK_SKEW)) || req.chosenAt().isBefore(now.minus(ASK_WITHIN))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "chosenAt이 너무 이르거나 늦어요");
        }
        var existing = visits.findById(req.id());
        if (existing.isPresent()) {
            if (!existing.get().getUserId().equals(user)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT);
            }
            return ResponseEntity.ok(VisitResponse.of(existing.get()));
        }
        Visit saved = visits.save(new Visit(req.id(), user, req.shopId(), req.shopName(), req.source(),
                req.distanceKm(), req.priceLimit(), req.chosenAt()));
        return ResponseEntity.status(HttpStatus.CREATED).body(VisitResponse.of(saved));
    }

    /** 지금 물어볼 기록: 1시간 ~ 3일 전에 고르고 아직 답하지도 취소하지도 않은 가장 최근 것. 없으면 204 */
    @GetMapping("/pending")
    public ResponseEntity<VisitResponse> pending(@AuthenticationPrincipal Jwt jwt) {
        Instant now = Instant.now();
        return visits.findFirstByUserIdAndAnsweredAtIsNullAndCancelledAtIsNullAndChosenAtBetweenOrderByChosenAtDesc(
                        userId(jwt), now.minus(ASK_WITHIN), now.minus(ASK_AFTER))
                .map(v -> ResponseEntity.ok(VisitResponse.of(v)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** 도감(S6): '네, 다녀왔어요'라고 답한 기록 (10/21 결정: 답한 곳만). 같은 가게를 여러 번 갔으면 화면이 하나로 합침 */
    @GetMapping("/zukan")
    public List<VisitResponse> zukan(@AuthenticationPrincipal Jwt jwt) {
        return visits.findTop200ByUserIdAndVisitedTrueOrderByChosenAtDesc(userId(jwt)).stream().map(VisitResponse::of).toList();
    }

    /** 다녀왔어요? 답. 다녀왔으면 영업 · 가격 두 질문이 다 필요 */
    @PutMapping("/{id}/feedback")
    public ResponseEntity<Void> feedback(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                         @Valid @RequestBody FeedbackRequest req) {
        Visit v = visits.findById(id)
                .filter(found -> found.getUserId().equals(userId(jwt))) // 남의 기록은 없는 것처럼
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        // 영업을 안 했으면 가격은 알 수 없어서 비워도 됨 (10/22: 도착했는데 문을 닫은 경우)
        if (req.visited() && (req.openOk() == null || (req.openOk() && req.priceOk() == null))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "다녀왔으면 영업 · 가격 답이 필요해요");
        }
        v.answer(req.visited(), req.openOk(), req.priceOk(), Instant.now());
        visits.save(v);
        return ResponseEntity.noContent().build();
    }

    /** 도착했어요 (10/22 결정: 버튼 + 앱을 열 때 가게 근처면 자동). 다녀온 것으로 보고 도감에 바로 넣음.
     *  취소했거나 이미 답한 기록은 409, 다시 보내도 괜찮음(영업 답만 더함) */
    @PutMapping("/{id}/arrive")
    public ResponseEntity<Void> arrive(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
                                       @Valid @RequestBody ArriveRequest req) {
        Visit v = visits.findById(id)
                .filter(found -> found.getUserId().equals(userId(jwt))) // 남의 기록은 없는 것처럼
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (v.getCancelledAt() != null || v.getAnsweredAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "취소했거나 이미 답한 기록이에요");
        }
        v.arrive(req.by(), req.openOk(), Instant.now());
        visits.save(v);
        return ResponseEntity.noContent().build();
    }

    /** 여기 갈래요 취소 (10/22 결정: 따로 기록). 이미 답한 기록은 취소할 수 없음(409), 다시 보내도 괜찮음 */
    @PutMapping("/{id}/cancel")
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        Visit v = visits.findById(id)
                .filter(found -> found.getUserId().equals(userId(jwt))) // 남의 기록은 없는 것처럼
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (v.getAnsweredAt() != null || v.getArrivedAt() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 답했거나 도착한 기록이에요");
        }
        v.cancel(Instant.now());
        visits.save(v);
        return ResponseEntity.noContent().build();
    }

    private static UUID userId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }
}
