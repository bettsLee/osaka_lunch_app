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
        subscriptions.save(new PushSubscription(ALICE, FCM, P256DH, AUTH, Instant.now()));
        Visit due = visit(ALICE, Duration.ofMinutes(100));
        Visit tooEarly = visit(ALICE, Duration.ofMinutes(30));
        Visit tooOld = visit(ALICE, Duration.ofHours(4));
        Visit answered = visit(ALICE, Duration.ofMinutes(100));
        answered.answer(true, true, true, Instant.now());
        visits.save(answered);
        Visit noSubscription = visit(BOB, Duration.ofMinutes(100));
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
