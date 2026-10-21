package com.osakalunch.backend.opinion;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 Postgres로 돌림 (CI는 서비스 컨테이너, 테이블은 create-drop) */
@SpringBootTest
@AutoConfigureMockMvc
class OpinionControllerTest {

    static final UUID ALICE = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID BOB = UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Autowired MockMvc mvc;
    @Autowired OpinionRepository opinions;

    @BeforeEach
    void clean() {
        opinions.deleteAll();
    }

    MockHttpServletRequestBuilder send(UUID user, String json) {
        return post("/api/opinions").with(jwt().jwt(j -> j.subject(user.toString())))
                .contentType(MediaType.APPLICATION_JSON).content(json);
    }

    @Test
    void 의견을_앞뒤_공백_없이_저장() throws Exception {
        mvc.perform(send(ALICE, """
                {"message":"  지도 핀이 겹쳐요  ","lang":"ko"}""")).andExpect(status().isNoContent());
        Opinion saved = opinions.findAll().get(0);
        assertThat(saved.getUserId()).isEqualTo(ALICE);
        assertThat(saved.getMessage()).isEqualTo("지도 핀이 겹쳐요");
        assertThat(saved.getLang()).isEqualTo("ko");
    }

    @Test
    void 빈_의견_너무_긴_의견_이상한_언어는_400() throws Exception {
        mvc.perform(send(ALICE, """
                {"message":"   ","lang":"ko"}""")).andExpect(status().isBadRequest());
        mvc.perform(send(ALICE, """
                {"message":"%s","lang":"ko"}""".formatted("가".repeat(OpinionController.MAX_LENGTH + 1))))
                .andExpect(status().isBadRequest());
        mvc.perform(send(ALICE, """
                {"message":"좋아요","lang":"<b>"}""")).andExpect(status().isBadRequest());
        assertThat(opinions.count()).isZero();
    }

    @Test
    void 하루에_5개까지_다른_사람은_따로() throws Exception {
        for (int i = 0; i < OpinionController.MAX_PER_DAY; i++) {
            mvc.perform(send(ALICE, """
                    {"message":"의견 %d","lang":"ko"}""".formatted(i))).andExpect(status().isNoContent());
        }
        mvc.perform(send(ALICE, """
                {"message":"하나 더","lang":"ko"}""")).andExpect(status().isTooManyRequests());
        mvc.perform(send(BOB, """
                {"message":"저도 하나","lang":"en"}""")).andExpect(status().isNoContent());
        assertThat(opinions.count()).isEqualTo(OpinionController.MAX_PER_DAY + 1);
    }

    @Test
    void 토큰이_없으면_401() throws Exception {
        mvc.perform(post("/api/opinions").contentType(MediaType.APPLICATION_JSON).content("""
                {"message":"좋아요","lang":"ko"}""")).andExpect(status().isUnauthorized());
    }
}
