package com.osakalunch.backend.share;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 Postgres로 돌림 (CI는 서비스 컨테이너, 테이블은 create-drop) */
@SpringBootTest
@AutoConfigureMockMvc
class ShareLinkControllerTest {

    static final UUID ALICE = UUID.fromString("11111111-1111-1111-1111-111111111111");

    @Autowired MockMvc mvc;
    @Autowired ShareLinkRepository links;
    @Autowired ObjectMapper json;

    @BeforeEach
    void clean() {
        links.deleteAll();
    }

    MockHttpServletRequestBuilder create(String body) {
        return post("/api/share-links").with(jwt().jwt(j -> j.subject(ALICE.toString())))
                .contentType(MediaType.APPLICATION_JSON).content(body);
    }

    @Test
    void 짧은_코드를_만들고_로그인_없이_가게_번호를_읽음() throws Exception {
        String res = mvc.perform(create("{\"shopIds\":[\"J001105962\",\"J002\",\"J001105962\"]}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String code = json.readTree(res).get("code").asText();
        assertThat(code).matches("[A-Za-z0-9]{6}");

        mvc.perform(get("/api/share-links/" + code)) // 받은 사람은 로그인 없이
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shopIds.length()").value(2)) // 겹친 건 하나
                .andExpect(jsonPath("$.shopIds[0]").value("J001105962"))
                .andExpect(jsonPath("$.userId").doesNotExist());
        mvc.perform(get("/api/share-links/zzzzzz")).andExpect(status().isNotFound());
        mvc.perform(get("/api/share-links/bad!")).andExpect(status().isNotFound());
    }

    @Test
    void 이상한_값은_400_로그인_없으면_401_하루_제한은_429() throws Exception {
        mvc.perform(create("{\"shopIds\":[]}")).andExpect(status().isBadRequest());
        mvc.perform(create("{\"shopIds\":[\"<script>\"]}")).andExpect(status().isBadRequest());
        String eleven = "{\"shopIds\":[" + String.join(",", java.util.Collections.nCopies(11, "\"J1\"")) + "]}";
        mvc.perform(create(eleven)).andExpect(status().isBadRequest());
        mvc.perform(post("/api/share-links").contentType(MediaType.APPLICATION_JSON).content("{\"shopIds\":[\"J1\"]}"))
                .andExpect(status().isUnauthorized());

        for (int i = 0; i < ShareLinkController.MAX_PER_DAY; i++) {
            links.save(new ShareLink("c" + String.format("%05d", i), ALICE, List.of("J1"), Instant.now()));
        }
        mvc.perform(create("{\"shopIds\":[\"J1\"]}")).andExpect(status().isTooManyRequests());
    }
}
