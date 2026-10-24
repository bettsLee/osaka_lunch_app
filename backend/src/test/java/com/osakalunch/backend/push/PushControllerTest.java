package com.osakalunch.backend.push;

import com.osakalunch.backend.visit.Visit;
import com.osakalunch.backend.visit.VisitRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 Postgres로 돌림. 푸시 서비스로 실제로 보내는 부분(PushSender)만 가짜 */
@SpringBootTest(properties = "push.cron-secret=test-secret")
@AutoConfigureMockMvc
class PushControllerTest {

    static final UUID ALICE = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID BOB = UUID.fromString("22222222-2222-2222-2222-222222222222");
    static final UUID CAROL = UUID.fromString("33333333-3333-3333-3333-333333333333");
    static final UUID DAVE = UUID.fromString("44444444-4444-4444-4444-444444444444");
    static final UUID ERIN = UUID.fromString("55555555-5555-5555-5555-555555555555");
    static final String FCM = "https://fcm.googleapis.com/fcm/send/test-endpoint";
    static final String P256DH = WebPushCryptoTest.UA_PUBLIC;
    static final String AUTH = WebPushCryptoTest.AUTH;

    @Autowired MockMvc mvc;
    @Autowired PushSubscriptionRepository subscriptions;
    @Autowired VisitRepository visits;
    @MockitoBean PushSender sender;

    @BeforeEach
    void clean() {
        visits.deleteAll();
        subscriptions.deleteAll();
        when(sender.ready()).thenReturn(true);
    }

    MockHttpServletRequestBuilder as(UUID user, MockHttpServletRequestBuilder req) {
        return req.with(jwt().jwt(j -> j.subject(user.toString()))).contentType(MediaType.APPLICATION_JSON);
    }

    String body(String endpoint, String p256dh) {
        return """
                {"endpoint":"%s","p256dh":"%s","auth":"%s"}""".formatted(endpoint, p256dh, AUTH);
    }

    Visit visit(UUID user, Duration ago) {
        return visits.save(new Visit(UUID.randomUUID(), user, "J000000001", "테스트 식당", "roulette", 0.4, 990,
                Instant.now().minus(ago)));
    }

    void subscribe(UUID user) {
        subscriptions.save(new PushSubscription(user, FCM + "-" + user, P256DH, AUTH, Instant.now()));
    }

    MockHttpServletRequestBuilder sendDue() {
        return post("/internal/push/send-due").header("X-Cron-Secret", "test-secret");
    }

    @Test
    void 같은_브라우저는_한_줄만_마지막_사용자로() throws Exception {
        mvc.perform(as(ALICE, post("/api/push/subscriptions")).content(body(FCM, P256DH))).andExpect(status().isNoContent());
        mvc.perform(as(BOB, post("/api/push/subscriptions")).content(body(FCM, P256DH))).andExpect(status().isNoContent());
        assertThat(subscriptions.count()).isEqualTo(1);
        assertThat(subscriptions.findByEndpoint(FCM).orElseThrow().getUserId()).isEqualTo(BOB);
    }

    @Test
    void 모르는_주소나_잘못된_키는_400_토큰이_없으면_401() throws Exception {
        mvc.perform(as(ALICE, post("/api/push/subscriptions")).content(body("http://localhost:8080/x", P256DH)))
                .andExpect(status().isBadRequest());
        mvc.perform(as(ALICE, post("/api/push/subscriptions")).content(body("https://fcm.googleapis.com.evil.example/x", P256DH)))
                .andExpect(status().isBadRequest());
        mvc.perform(as(ALICE, post("/api/push/subscriptions")).content(body(FCM, "abc"))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/push/subscriptions").contentType(MediaType.APPLICATION_JSON).content(body(FCM, P256DH)))
                .andExpect(status().isUnauthorized());
        assertThat(subscriptions.count()).isZero();
    }

    @Test
    void 비밀_값이_없거나_틀리면_403() throws Exception {
        mvc.perform(post("/internal/push/send-due")).andExpect(status().isForbidden());
        mvc.perform(post("/internal/push/send-due").header("X-Cron-Secret", "wrong")).andExpect(status().isForbidden());
    }

    @Test
    void 한_시간_반이_지난_기록에_한_번만() throws Exception {
        // 사람마다 가장 최근에 고른 기록만 보므로 경우마다 사람을 나눔 (10/24)
        for (UUID u : new UUID[] {ALICE, CAROL, DAVE, ERIN}) subscribe(u);
        Visit due = visit(ALICE, Duration.ofMinutes(100));
        Visit tooEarly = visit(CAROL, Duration.ofMinutes(30));
        Visit tooOld = visit(DAVE, Duration.ofHours(4));
        Visit answered = visit(ERIN, Duration.ofMinutes(100));
        answered.answer(true, true, true, Instant.now());
        visits.save(answered);
        Visit noSubscription = visit(BOB, Duration.ofMinutes(100));
        Visit cancelled = visit(ERIN, Duration.ofMinutes(95)); // 정했다가 취소한 건 보내지 않음
        cancelled.cancel(Instant.now());
        visits.save(cancelled);
        when(sender.send(any(), any())).thenReturn(201);

        mvc.perform(sendDue()).andExpect(status().isOk())
                .andExpect(jsonPath("$.due").value(2)) // 앨리스 1 + 아직 허용 안 한 밥 1
                .andExpect(jsonPath("$.sent").value(1));
        mvc.perform(sendDue()).andExpect(jsonPath("$.sent").value(0)); // 이미 보낸 건 다시 안 보냄

        verify(sender, times(1)).send(any(), any());
        assertThat(visits.findById(due.getId()).orElseThrow().getNotifiedAt()).isNotNull();
        assertThat(visits.findById(tooEarly.getId()).orElseThrow().getNotifiedAt()).isNull();
        assertThat(visits.findById(tooOld.getId()).orElseThrow().getNotifiedAt()).isNull();
        assertThat(visits.findById(noSubscription.getId()).orElseThrow().getNotifiedAt()).isNull(); // 시간 안에 허용하면 보냄
        assertThat(visits.findById(cancelled.getId()).orElseThrow().getNotifiedAt()).isNull();
    }

    @Test
    void 가장_최근에_고른_기록만_도착했으면_도착_45분_뒤() throws Exception {
        for (UUID u : new UUID[] {ALICE, BOB, CAROL}) subscribe(u);
        // 앨리스: 100분 전 기록이 있어도 30분 전에 새로 골랐으면 예전 건 보내지 않음
        Visit old = visit(ALICE, Duration.ofMinutes(100));
        Visit fresh = visit(ALICE, Duration.ofMinutes(30));
        // 밥: 60분 전에 고르고 50분 전에 도착 → 고른 지 1시간 반 전이어도 도착 45분이 지나서 보냄
        Visit ate = visit(BOB, Duration.ofMinutes(60));
        ate.arrive("auto", true, Instant.now().minus(Duration.ofMinutes(50)));
        visits.save(ate);
        // 캐럴: 100분 전에 고르고 30분 전에 도착 → 아직 먹는 중일 수 있어서 안 보냄
        Visit eating = visit(CAROL, Duration.ofMinutes(100));
        eating.arrive("manual", true, Instant.now().minus(Duration.ofMinutes(30)));
        visits.save(eating);
        when(sender.send(any(), any())).thenReturn(201);

        mvc.perform(sendDue()).andExpect(status().isOk())
                .andExpect(jsonPath("$.due").value(1))
                .andExpect(jsonPath("$.sent").value(1));

        assertThat(visits.findById(ate.getId()).orElseThrow().getNotifiedAt()).isNotNull();
        assertThat(visits.findById(old.getId()).orElseThrow().getNotifiedAt()).isNull();
        assertThat(visits.findById(fresh.getId()).orElseThrow().getNotifiedAt()).isNull();
        assertThat(visits.findById(eating.getId()).orElseThrow().getNotifiedAt()).isNull();
    }

    @Test
    void 만료된_구독은_지우고_일시_오류면_다음_실행_때_다시() throws Exception {
        subscriptions.save(new PushSubscription(ALICE, FCM, P256DH, AUTH, Instant.now()));
        subscriptions.save(new PushSubscription(BOB, "https://web.push.apple.com/test-endpoint", P256DH, AUTH, Instant.now()));
        Visit alice = visit(ALICE, Duration.ofMinutes(100));
        Visit bob = visit(BOB, Duration.ofMinutes(100));
        when(sender.send(any(), any())).thenAnswer(inv -> ((PushSubscription) inv.getArgument(0)).getUserId().equals(ALICE) ? 410 : 503);

        mvc.perform(sendDue()).andExpect(status().isOk())
                .andExpect(jsonPath("$.removed").value(1))
                .andExpect(jsonPath("$.failed").value(1));

        assertThat(subscriptions.count()).isEqualTo(1);
        assertThat(visits.findById(alice.getId()).orElseThrow().getNotifiedAt()).isNotNull();
        assertThat(visits.findById(bob.getId()).orElseThrow().getNotifiedAt()).isNull();
    }
}
