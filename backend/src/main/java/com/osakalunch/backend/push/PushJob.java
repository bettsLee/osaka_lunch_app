package com.osakalunch.backend.push;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.osakalunch.backend.visit.Visit;
import com.osakalunch.backend.visit.VisitRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.net.URI;
import java.security.GeneralSecurityException;
import java.text.NumberFormat;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * '다녀왔어요?' 알림 보내기. GitHub Actions가 점심 뒤 시간대에 15분마다 부름
 * 여기 갈래요 1시간 반 뒤부터 3시간 뒤까지 (도착했으면 도착 45분 뒤부터 3시간 뒤까지), 아직 답하지 않았고 알림도 안 보냈고
 * 취소하지 않은 기록에 한 번만 보냄. 그 사람이 가장 최근에 고른 기록만 (10/24 결정)
 */
@Service
public class PushJob {

    private static final Logger log = LoggerFactory.getLogger(PushJob.class);
    static final Duration SEND_AFTER = Duration.ofMinutes(90);  // 10/21 결정: 1시간 반 뒤
    static final Duration SEND_WITHIN = Duration.ofHours(3);    // 실행이 늦어도 이보다 오래된 건 보내지 않음 (앱을 열면 물어봄)

    public record Result(int due, int sent, int failed, int removed) {
    }

    private final VisitRepository visits;
    private final PushSubscriptionRepository subscriptions;
    private final PushSender sender;
    private final ObjectMapper json;

    public PushJob(VisitRepository visits, PushSubscriptionRepository subscriptions, PushSender sender, ObjectMapper json) {
        this.visits = visits;
        this.subscriptions = subscriptions;
        this.sender = sender;
        this.json = json;
    }

    @Transactional
    public Result run(Instant now) {
        List<Visit> due = visits.findPushDue(now.minus(SEND_WITHIN), now.minus(SEND_AFTER),
                now.minus(SEND_WITHIN), now.minus(Visit.ASK_AFTER_ARRIVAL));
        Map<UUID, List<Visit>> byUser = due.stream().collect(Collectors.groupingBy(Visit::getUserId));
        Map<UUID, List<PushSubscription>> subsByUser = subscriptions.findByUserIdIn(byUser.keySet()).stream()
                .collect(Collectors.groupingBy(PushSubscription::getUserId));
        int sent = 0, failed = 0, removed = 0;

        for (var entry : byUser.entrySet()) {
            List<PushSubscription> subs = subsByUser.getOrDefault(entry.getKey(), List.of());
            if (subs.isEmpty()) continue; // 아직 허용 전. 시간 안에 허용하면 다음 실행 때 보냄
            // 한 사람이 여러 곳을 골랐으면 가장 최근 것 하나만 물어봄 (앱의 질문 카드와 같은 기준)
            Visit latest = entry.getValue().stream().max(Comparator.comparing(Visit::getChosenAt)).orElseThrow();
            byte[] payload = payload(latest);
            boolean delivered = false, retry = false;
            for (PushSubscription sub : subs) {
                try {
                    int code = sender.send(sub, payload);
                    if (code >= 200 && code < 300) {
                        sent++;
                        delivered = true;
                    } else if (code == 404 || code == 410) { // 알림을 끄거나 앱을 지운 브라우저
                        subscriptions.delete(sub);
                        removed++;
                    } else {
                        failed++;
                        retry = true;
                        log.warn("알림 실패 {} ({})", code, host(sub));
                    }
                } catch (IOException | GeneralSecurityException | RuntimeException e) {
                    failed++;
                    retry = true;
                    log.warn("알림 실패 {} ({})", e.getClass().getSimpleName(), host(sub));
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    failed++;
                    retry = true;
                }
            }
            if (delivered || !retry) entry.getValue().forEach(v -> v.markNotified(now)); // 일시적 실패만이면 다음 실행 때 다시
        }
        Result result = new Result(due.size(), sent, failed, removed);
        log.info("다녀왔어요? 알림: {}", result);
        return result;
    }

    private byte[] payload(Visit v) {
        String limit = NumberFormat.getIntegerInstance(Locale.JAPAN).format(v.getPriceLimit());
        // 도착했어요에서 영업 중이라고 이미 답했으면 가격만 물음 (10/22)
        boolean priceOnly = v.getArrivedAt() != null && Boolean.TRUE.equals(v.getOpenOk());
        try {
            // title · body는 한국어 기본 문구. 휴대폰 언어 문구는 서비스 워커가 kind에 맞게 shop · limit을 넣어 만듦
            return json.writeValueAsBytes(Map.of(
                    "title", priceOnly ? "점심 어땠어요?" : "다녀왔어요?",
                    "body", priceOnly
                            ? v.getShopName() + " — 점심 가격이 " + limit + "엔 이하였는지 알려 주세요"
                            : v.getShopName() + " — 영업하고 있었는지, " + limit + "엔 이하였는지 알려 주세요",
                    "kind", priceOnly ? "price" : "visit",
                    "shop", v.getShopName(),
                    "limit", limit,
                    "url", "/?from=push",
                    "tag", "visit"));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String host(PushSubscription sub) {
        return URI.create(sub.getEndpoint()).getHost(); // 주소 전체는 사용자 식별자라 로그에 남기지 않음
    }
}
