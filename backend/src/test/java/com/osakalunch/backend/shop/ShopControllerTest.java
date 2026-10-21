package com.osakalunch.backend.shop;

import com.osakalunch.backend.i18n.Translator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 Postgres로 돌림. shops 표는 수집 배치가 만드는 표라 테스트가 간단히 만들고, Gemini(Translator)만 가짜 */
@SpringBootTest
@AutoConfigureMockMvc
class ShopControllerTest {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ShopTranslationRepository translations;
    @MockitoBean Translator translator;

    @BeforeEach
    void setUp() {
        jdbc.execute("create table if not exists shops (id text primary key, catch text)");
        jdbc.update("delete from shops");
        translations.deleteAll();
        when(translator.ready()).thenReturn(true);
        when(translator.model()).thenReturn("test-model");
    }

    MockHttpServletRequestBuilder ask(String shopId, String lang) {
        return get("/api/shops/" + shopId + "/catch").param("lang", lang)
                .with(jwt().jwt(j -> j.subject("11111111-1111-1111-1111-111111111111")));
    }

    @Test
    void 처음_한_번만_번역하고_원문이_바뀌면_다시() throws Exception {
        jdbc.update("insert into shops (id, catch) values (?, ?)", "J1", "お酒がすすむメニュー満載");
        when(translator.translateShopText("お酒がすすむメニュー満載", "ko")).thenReturn("술이 술술 들어가는 메뉴 가득");

        mvc.perform(ask("J1", "ko")).andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("술이 술술 들어가는 메뉴 가득"))
                .andExpect(jsonPath("$.lang").value("ko"));
        mvc.perform(ask("J1", "ko")).andExpect(status().isOk());
        verify(translator, times(1)).translateShopText(any(), eq("ko"));

        jdbc.update("update shops set catch = ? where id = ?", "本格中華", "J1");
        when(translator.translateShopText("本格中華", "ko")).thenReturn("정통 중화요리");
        mvc.perform(ask("J1", "ko")).andExpect(jsonPath("$.text").value("정통 중화요리"));
        assertThat(translations.count()).isEqualTo(1); // 한 줄을 고쳐 씀
    }

    @Test
    void 소개가_없으면_204_일본어나_이상한_값은_400_토큰이_없으면_401() throws Exception {
        jdbc.update("insert into shops (id, catch) values (?, ?)", "J2", "");
        mvc.perform(ask("J2", "en")).andExpect(status().isNoContent());
        mvc.perform(ask("NOPE", "en")).andExpect(status().isNoContent()); // 목록에서 빠진 가게
        mvc.perform(ask("J2", "ja")).andExpect(status().isBadRequest());
        mvc.perform(ask("J2", "xx")).andExpect(status().isBadRequest());
        mvc.perform(ask("J_2", "en")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/shops/J2/catch").param("lang", "en")).andExpect(status().isUnauthorized());
        verify(translator, never()).translateShopText(any(), any());
    }
}
