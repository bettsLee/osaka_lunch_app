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
    void 다녀왔어요는_1시간_지나고_3일_안의_내_기록만() throws Exception {
        saved(ALICE, Duration.ofMinutes(10)); // 아직 이름
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isNoContent());

        Visit older = saved(ALICE, Duration.ofHours(5));
        Visit recent = saved(ALICE, Duration.ofHours(2));
        saved(ALICE, Duration.ofDays(4)); // 너무 옛날
        saved(BOB, Duration.ofHours(1).plusMinutes(30)); // 남의 기록
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(recent.getId().toString()))
                .andExpect(jsonPath("$.priceLimit").value(990));

        mvc.perform(as(ALICE, put("/api/visits/" + recent.getId() + "/feedback")).content("{\"visited\":false}"))
                .andExpect(status().isNoContent());
        mvc.perform(as(ALICE, get("/api/visits/pending"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(older.getId().toString())); // 답한 건 다시 묻지 않음
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
    void 도감은_다녀왔다고_답한_내_기록만_최근_것부터() throws Exception {
        Visit older = saved(ALICE, Duration.ofDays(2));
        older.answer(true, true, true, Instant.now());
        visits.save(older);
        Visit newer = saved(ALICE, Duration.ofHours(3));
        newer.answer(true, false, true, Instant.now());
        visits.save(newer);
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
}
