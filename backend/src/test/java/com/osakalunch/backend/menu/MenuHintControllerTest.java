package com.osakalunch.backend.menu;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 실제 Postgres로 돌림 (CI는 서비스 컨테이너, 테이블은 create-drop). Gemini는 부르지 않음 */
@SpringBootTest
@AutoConfigureMockMvc
class MenuHintControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ShopRepository shops;
    @MockitoBean MenuHintClient client;
    @MockitoBean PlacePhotosClient photos;

    @BeforeEach
    void setUp() {
        shops.deleteAll();
        shops.save(new Shop("J1", "北極星", 34.65, 135.43));
        shops.save(new Shop("J2", "좌표 없음", null, null));
        when(client.ready()).thenReturn(true);
        when(photos.ready()).thenReturn(true);
    }

    @Test
    void 로그인하면_대표_메뉴를_주고_저장하지_않게_함() throws Exception {
        when(client.ask(any(), eq("ja"), any())).thenReturn(new MenuHint("ok", "open", List.of("オムライス"), "lunch",
                List.of(new MenuHint.Source("Hokkyokusei - Google Maps", "https://maps.google.com/?cid=1")), "ChIJ1234567890"));
        mvc.perform(get("/api/shops/J1/menu-hint?lang=ja").with(jwt()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.menus[0]").value("オムライス"))
                .andExpect(jsonPath("$.sources[0].uri").value("https://maps.google.com/?cid=1"))
                .andExpect(jsonPath("$.kind").value("lunch"))
                .andExpect(jsonPath("$.placeId").value("ChIJ1234567890"));
    }

    @Test
    void 사진_키가_없으면_가게_ID를_주지_않음() throws Exception {
        when(photos.ready()).thenReturn(false);
        when(client.ask(any(), any(), any())).thenReturn(new MenuHint("ok", "open", List.of("オムライス"), "lunch",
                List.of(new MenuHint.Source("Hokkyokusei - Google Maps", "https://maps.google.com/?cid=1")), "ChIJ1234567890"));
        mvc.perform(get("/api/shops/J1/menu-hint").with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.menus[0]").value("オムライス"))
                .andExpect(jsonPath("$.placeId").doesNotExist());
    }

    @Test
    void 로그인_없으면_401_없는_가게는_404_좌표_없으면_묻지_않음() throws Exception {
        mvc.perform(get("/api/shops/J1/menu-hint")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/shops/J9/menu-hint").with(jwt())).andExpect(status().isNotFound());
        mvc.perform(get("/api/shops/bad!/menu-hint").with(jwt())).andExpect(status().isNotFound());
        mvc.perform(get("/api/shops/J2/menu-hint").with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("unavailable"));
        verify(client, never()).ask(any(), any(), any());
    }

    @Test
    void 이상한_언어는_한국어로() throws Exception {
        when(client.ask(any(), any(), any())).thenReturn(MenuHint.unavailable());
        mvc.perform(get("/api/shops/J1/menu-hint").param("lang", "<x>").with(jwt())).andExpect(status().isOk());
        verify(client).ask(any(), eq("ko"), any());
    }

    @Test
    void 하루_한도를_넘으면_묻지_않고_다음_날_다시() {
        Clock[] now = {Clock.fixed(Instant.parse("2026-11-17T03:00:00Z"), ZoneId.of("Asia/Tokyo"))};
        MenuHintController c = new MenuHintController(shops, client, photos, 2, new Clock() {
            @Override public ZoneId getZone() { return now[0].getZone(); }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now[0].instant(); }
        });
        assertThat(c.take()).isTrue();
        assertThat(c.take()).isTrue();
        assertThat(c.take()).isFalse();
        now[0] = Clock.fixed(Instant.parse("2026-11-17T15:30:00Z"), ZoneId.of("Asia/Tokyo")); // 오사카 11/18 0:30
        assertThat(c.take()).isTrue();
    }
}
