package com.osakalunch.backend.visit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 Postgres로 돌림 (CI는 서비스 컨테이너, 테이블은 create-drop) */
@SpringBootTest
@AutoConfigureMockMvc
class VisitControllerTest {

    static final UUID ALICE = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID BOB = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Autowired MockMvc mvc;
    @Autowired VisitRepository visits;

    @BeforeEach
    void clean() {
        visits.deleteAll();
    }

    MockHttpServletRequestBuilder as(UUID user, MockHttpServletRequestBuilder req) {
        return req.with(jwt().jwt(j -> j.subject(user.toString()))).contentType(MediaType.APPLICATION_JSON);
    }

    String body(UUID id, Instant chosenAt) {
        return """
                {"id":"%s","shopId":"J000000001","shopName":"테스트 식당","source":"roulette",
                 "distanceKm":0.42,"priceLimit":990,"chosenAt":"%s"}""".formatted(id, chosenAt);
    }

    Visit saved(UUID user, Duration ago) {
        return visits.save(new Visit(UUID.randomUUID(), user, "J000000001", "테스트 식당", "roulette", 0.4, 990,
                Instant.now().minus(ago)));
    }

    @Test
    void 토큰이_없으면_401_서버_깨우기는_그대로() throws Exception {
        mvc.perform(get("/api/visits/pending")).andExpect(status().isUnauthorized());
        mvc.perform(get("/health")).andExpect(status().isOk());
    }

    @Test
    void 여기_갈래요를_다시_보내도_한_번만_저장() throws Exception {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        mvc.perform(as(ALICE, post("/api/visits")).content(body(id, now))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.shopName").value("테스트 식당"));
        mvc.perform(as(ALICE, post("/api/visits")).content(body(id, now))).andExpect(status().isOk());
        mvc.perform(as(BOB, post("/api/visits")).content(body(id, now))).andExpect(status().isConflict());
        assertThat(visits.count()).isEqualTo(1);
        assertThat(visits.findById(id).orElseThrow().getUserId()).isEqualTo(ALICE);
    }

    @Test
    void 이상한_값은_400() throws Exception {
        mvc.perform(as(ALICE, post("/api/visits")).content(body(UUID.randomUUID(), Instant.now().plus(Duration.ofHours(1)))))
                .andExpect(status().isBadRequest()); // 미래 시각
        mvc.perform(as(ALICE, post("/api/visits")).content(body(UUID.randomUUID(), Instant.now().minus(Duration.ofDays(4)))))
                .andExpect(status().isBadRequest()); // 너무 옛날
        mvc.perform(as(ALICE, post("/api/visits")).content(body(UUID.randomUUID(), Instant.now()).replace("roulette", "push")))
                .andExpect(status().isBadRequest());
        mvc.perform(as(ALICE, post("/api/visits")).content("{\"id\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isBadRequest());
        assertThat(visits.count()).isZero();
    }

    @Test
    void 다녀왔어요는_가장_최근에_고른_내_기록만_1시간_지나고_3일_안() throws Exception {
        saved(ALICE, Duration.ofHours(5));
        Visit recent = saved(ALICE, Duration.ofHours(2));
        saved(BOB, Duration.ofHours(1).plusMinutes(30)); // 남의 기록
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(recent.getId().toString()))
                .andExpect(jsonPath("$.priceLimit").value(990));

        mvc.perform(as(ALICE, put("/api/visits/" + recent.getId() + "/feedback")).content("{\"visited\":false}"))
                .andExpect(status().isNoContent());
        // 답한 건 다시 묻지 않고, 그보다 예전 기록(5시간 전)도 묻지 않음 (10/24 결정: 가장 최근에 고른 것만)
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());

        saved(ALICE, Duration.ofMinutes(10)); // 새로 고름: 아직 1시간이 안 됨
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());

        visits.deleteAll();
        saved(ALICE, Duration.ofDays(4)); // 너무 옛날
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());
    }

    @Test
    void 새로_고른_가게가_있으면_예전_기록은_묻지_않음() throws Exception {
        saved(ALICE, Duration.ofDays(1)); // 어제 고르고 답하지 않은 기록
        Visit today = saved(ALICE, Duration.ofMinutes(30)); // 오늘 새로 고름 (아직 1시간 전)
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());

        today.cancel(Instant.now()); // 오늘 것을 취소해도 어제 기록을 다시 묻지 않음
        visits.save(today);
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());
    }

    @Test
    void 도착했으면_도착_45분_뒤부터_물음() throws Exception {
        // 100분 전에 고르고 30분 전에 도착: 고른 지 1시간은 지났지만 아직 먹는 중일 수 있음
        Visit eating = saved(ALICE, Duration.ofMinutes(100));
        eating.arrive("auto", true, Instant.now().minus(Duration.ofMinutes(30)));
        visits.save(eating);
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());

        // 60분 전에 고르고 50분 전에 도착: 도착 45분이 지났으니 가격만 물음
        Visit ate = saved(BOB, Duration.ofMinutes(60));
        ate.arrive("manual", true, Instant.now().minus(Duration.ofMinutes(50)));
        visits.save(ate);
        mvc.perform(as(BOB, get("/api/visits/pending"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ate.getId().toString()))
                .andExpect(jsonPath("$.arrived").value(true))
                .andExpect(jsonPath("$.openOk").value(true));
    }

    @Test
    void 취소하면_질문_카드에서_빠지고_답한_건_취소할_수_없음() throws Exception {
        Visit v = saved(ALICE, Duration.ofHours(2));
        String url = "/api/visits/" + v.getId() + "/cancel";
        mvc.perform(as(BOB, put(url))).andExpect(status().isNotFound()); // 남의 기록
        mvc.perform(as(ALICE, put(url))).andExpect(status().isNoContent());
        mvc.perform(as(ALICE, put(url))).andExpect(status().isNoContent()); // 다시 보내도 괜찮음
        assertThat(visits.findById(v.getId()).orElseThrow().getCancelledAt()).isNotNull();
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());

        Visit answered = saved(ALICE, Duration.ofHours(3));
        answered.answer(false, null, null, Instant.now());
        visits.save(answered);
        mvc.perform(as(ALICE, put("/api/visits/" + answered.getId() + "/cancel"))).andExpect(status().isConflict());
    }

    @Test
    void 다녀왔으면_영업_가격_답이_다_필요() throws Exception {
        Visit v = saved(ALICE, Duration.ofHours(2));
        String url = "/api/visits/" + v.getId() + "/feedback";
        mvc.perform(as(ALICE, put(url)).content("{\"visited\":true,\"openOk\":true}")).andExpect(status().isBadRequest());
        mvc.perform(as(BOB, put(url)).content("{\"visited\":true,\"openOk\":true,\"priceOk\":false}")).andExpect(status().isNotFound());
        mvc.perform(as(ALICE, put(url)).content("{\"visited\":true,\"openOk\":true,\"priceOk\":false}")).andExpect(status().isNoContent());

        Visit answered = visits.findById(v.getId()).orElseThrow();
        assertThat(answered.getVisited()).isTrue();
        assertThat(answered.getOpenOk()).isTrue();
        assertThat(answered.getPriceOk()).isFalse();
        assertThat(answered.getAnsweredAt()).isNotNull();
    }

    @Test
    void 안_갔으면_영업_가격은_비워_둠() throws Exception {
        Visit v = saved(ALICE, Duration.ofHours(2));
        mvc.perform(as(ALICE, put("/api/visits/" + v.getId() + "/feedback"))
                .content("{\"visited\":false,\"openOk\":true,\"priceOk\":true}")).andExpect(status().isNoContent());
        Visit answered = visits.findById(v.getId()).orElseThrow();
        assertThat(answered.getVisited()).isFalse();
        assertThat(answered.getOpenOk()).isNull();
        assertThat(answered.getPriceOk()).isNull();
    }

    @Test
    void 도감은_다녀왔다고_답한_내_기록만_최근_것부터_닫혀_있던_곳은_뺌() throws Exception {
        Visit older = saved(ALICE, Duration.ofDays(2));
        older.answer(true, true, true, Instant.now());
        visits.save(older);
        Visit newer = saved(ALICE, Duration.ofHours(3));
        newer.answer(true, true, false, Instant.now()); // 가격은 틀렸어도 먹은 곳
        visits.save(newer);
        Visit closed = saved(ALICE, Duration.ofHours(1));
        closed.answer(true, false, null, Instant.now()); // 갔는데 닫혀 있었음 (10/23 결정: 도감에서 뺌)
        visits.save(closed);
        Visit notGone = saved(ALICE, Duration.ofHours(4));
        notGone.answer(false, null, null, Instant.now());
        visits.save(notGone);
        saved(ALICE, Duration.ofHours(2)); // 아직 답 안 함
        Visit bobs = saved(BOB, Duration.ofHours(3));
        bobs.answer(true, true, true, Instant.now());
        visits.save(bobs);

        mvc.perform(as(ALICE, get("/api/visits/zukan"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(newer.getId().toString()))
                .andExpect(jsonPath("$[1].id").value(older.getId().toString()));
        mvc.perform(get("/api/visits/zukan")).andExpect(status().isUnauthorized());
    }

    @Test
    void 도착하면_도감에_바로_들어가고_질문_카드는_가격만() throws Exception {
        Visit v = saved(ALICE, Duration.ofMinutes(70));
        String url = "/api/visits/" + v.getId() + "/arrive";
        mvc.perform(as(BOB, put(url)).content("{\"by\":\"auto\"}")).andExpect(status().isNotFound()); // 남의 기록
        mvc.perform(as(ALICE, put(url)).content("{\"by\":\"gps\"}")).andExpect(status().isBadRequest());
        mvc.perform(as(ALICE, put(url)).content("{\"by\":\"auto\"}")).andExpect(status().isNoContent());

        mvc.perform(as(ALICE, get("/api/visits/zukan"))).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent()); // 도착 직후엔 묻지 않음 (도착 45분 뒤부터)

        // 그 자리에서 영업 여부를 답함: 처음 도착 방법은 그대로
        mvc.perform(as(ALICE, put(url)).content("{\"by\":\"manual\",\"openOk\":true}")).andExpect(status().isNoContent());
        Visit arrived = visits.findById(v.getId()).orElseThrow();
        assertThat(arrived.getArrivedBy()).isEqualTo("auto");
        assertThat(arrived.getArrivedAt()).isNotNull();
        assertThat(arrived.getVisited()).isTrue();
        assertThat(arrived.getOpenOk()).isTrue();
        assertThat(arrived.getAnsweredAt()).isNull(); // 가격은 아직이라 질문 카드 · 알림이 남음

        mvc.perform(as(ALICE, put("/api/visits/" + v.getId() + "/cancel"))).andExpect(status().isConflict()); // 도착한 건 취소 못 함
    }

    @Test
    void 취소한_기록은_도착할_수_없고_도착해서_문을_닫았으면_더_묻지_않음() throws Exception {
        Visit cancelled = saved(ALICE, Duration.ofMinutes(20));
        cancelled.cancel(Instant.now());
        visits.save(cancelled);
        mvc.perform(as(ALICE, put("/api/visits/" + cancelled.getId() + "/arrive")).content("{\"by\":\"manual\"}"))
                .andExpect(status().isConflict());

        // 도착했는데 영업을 안 함: 가격은 알 수 없어서 바로 답한 것으로
        Visit closed = saved(ALICE, Duration.ofMinutes(20));
        mvc.perform(as(ALICE, put("/api/visits/" + closed.getId() + "/arrive")).content("{\"by\":\"manual\",\"openOk\":false}"))
                .andExpect(status().isNoContent());
        Visit answered = visits.findById(closed.getId()).orElseThrow();
        assertThat(answered.getVisited()).isTrue();
        assertThat(answered.getOpenOk()).isFalse();
        assertThat(answered.getPriceOk()).isNull();
        assertThat(answered.getAnsweredAt()).isNotNull();
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());
        mvc.perform(as(ALICE, get("/api/visits/zukan"))).andExpect(jsonPath("$.length()").value(0)); // 닫혀 있던 곳은 도감에 없음
        mvc.perform(as(ALICE, put("/api/visits/" + closed.getId() + "/arrive")).content("{\"by\":\"auto\"}"))
                .andExpect(status().isConflict()); // 이미 답함

        // '다녀왔어요?' 카드에서도 닫혀 있었으면 가격 없이 보낼 수 있음
        Visit asked = saved(ALICE, Duration.ofMinutes(100));
        mvc.perform(as(ALICE, put("/api/visits/" + asked.getId() + "/feedback")).content("{\"visited\":true,\"openOk\":false}"))
                .andExpect(status().isNoContent());
        mvc.perform(as(ALICE, put("/api/visits/" + asked.getId() + "/feedback")).content("{\"visited\":true,\"openOk\":true}"))
                .andExpect(status().isBadRequest()); // 영업했으면 가격 답은 필요
    }

    @Test
    void 또_갈래요는_답할_때_켜고_도감에서_가게마다_켜고_끔() throws Exception {
        Visit first = saved(ALICE, Duration.ofDays(2));
        Visit second = saved(ALICE, Duration.ofMinutes(90));
        mvc.perform(as(ALICE, put("/api/visits/" + first.getId() + "/feedback")).content("{\"visited\":true,\"openOk\":true,\"priceOk\":true}"))
                .andExpect(status().isNoContent());
        mvc.perform(as(ALICE, put("/api/visits/" + second.getId() + "/feedback"))
                        .content("{\"visited\":true,\"openOk\":true,\"priceOk\":false,\"again\":true}"))
                .andExpect(status().isNoContent());
        mvc.perform(as(ALICE, get("/api/visits/zukan")))
                .andExpect(jsonPath("$[0].again").value(true))
                .andExpect(jsonPath("$[1].again").isEmpty());

        // 도감에서 끔: 그 가게에 다녀온 기록 모두
        mvc.perform(as(ALICE, put("/api/visits/again")).content("{\"shopId\":\"J000000001\",\"again\":false}"))
                .andExpect(status().isNoContent());
        assertThat(visits.findAll()).allMatch(v -> Boolean.FALSE.equals(v.getAgain()));
        mvc.perform(as(BOB, put("/api/visits/again")).content("{\"shopId\":\"J000000001\",\"again\":true}"))
                .andExpect(status().isNotFound()); // 다녀온 적 없음
        mvc.perform(as(ALICE, put("/api/visits/again")).content("{\"shopId\":\"J000000001\"}"))
                .andExpect(status().isBadRequest());
    }
}
