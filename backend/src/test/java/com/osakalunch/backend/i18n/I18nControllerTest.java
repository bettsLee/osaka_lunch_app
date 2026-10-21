package com.osakalunch.backend.i18n;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 Postgres로 돌림. 원문 받기(SourceCatalog)와 Gemini(Translator)만 가짜 */
@SpringBootTest
@AutoConfigureMockMvc
class I18nControllerTest {

    static final Map<String, String> SOURCE = Map.of("common.walk", "걸어서 {n}분");

    @Autowired MockMvc mvc;
    @Autowired TranslationRepository translations;
    @MockitoBean SourceCatalog source;
    @MockitoBean Translator translator;

    @BeforeEach
    void setUp() throws Exception {
        translations.deleteAll();
        when(source.current()).thenReturn(new SourceCatalog.Source("v1", SOURCE));
        when(translator.ready()).thenReturn(true);
        when(translator.model()).thenReturn("test-model");
    }

    @Test
    void 처음_한_번만_번역하고_저장한_것을_줌_로그인_없이() throws Exception {
        when(translator.translate(any(), eq("vi"))).thenReturn(Map.of("common.walk", "Đi bộ {n} phút"));

        mvc.perform(get("/api/i18n/vi")).andExpect(status().isOk())
                .andExpect(jsonPath("$.lang").value("vi"))
                .andExpect(jsonPath("$.version").value("v1-p" + Translator.PROMPT_VERSION))
                .andExpect(jsonPath("$.messages['common.walk']").value("Đi bộ {n} phút"));
        mvc.perform(get("/api/i18n/vi")).andExpect(status().isOk())
                .andExpect(jsonPath("$.messages['common.walk']").value("Đi bộ {n} phút"));

        verify(translator, times(1)).translate(any(), eq("vi"));
        assertThat(translations.count()).isEqualTo(1);
    }

    @Test
    void 원문이_바뀌면_다시_번역() throws Exception {
        when(translator.translate(any(), eq("ne"))).thenReturn(Map.of("common.walk", "हिँडेर {n} मिनेट"));
        mvc.perform(get("/api/i18n/ne")).andExpect(status().isOk());
        when(source.current()).thenReturn(new SourceCatalog.Source("v2", SOURCE));
        mvc.perform(get("/api/i18n/ne")).andExpect(jsonPath("$.version").value("v2-p" + Translator.PROMPT_VERSION));
        verify(translator, times(2)).translate(any(), eq("ne"));
    }

    @Test
    void 이상한_언어_코드는_400_번역_안_함() throws Exception {
        for (String lang : new String[]{"ko", "en", "xx", "VI", "vi-VN", "zh-Hanx"}) {
            mvc.perform(get("/api/i18n/" + lang)).andExpect(status().isBadRequest());
        }
        verify(translator, never()).translate(any(), any());
    }

    @Test
    void 중국어_간체_번체는_따로() throws Exception {
        when(translator.translate(any(), eq("zh-Hant"))).thenReturn(Map.of("common.walk", "步行 {n} 分鐘"));
        mvc.perform(get("/api/i18n/zh-Hant")).andExpect(status().isOk()).andExpect(jsonPath("$.lang").value("zh-Hant"));
    }

    @Test
    void 번역_설정이_없으면_503_결과가_틀리면_502() throws Exception {
        when(translator.ready()).thenReturn(false);
        mvc.perform(get("/api/i18n/vi")).andExpect(status().isServiceUnavailable());

        when(translator.ready()).thenReturn(true);
        when(translator.translate(any(), eq("vi"))).thenThrow(new Translator.TranslationFailed("test"));
        mvc.perform(get("/api/i18n/vi")).andExpect(status().isBadGateway());
        assertThat(translations.count()).isZero();
    }
}
