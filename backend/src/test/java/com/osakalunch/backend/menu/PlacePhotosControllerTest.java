package com.osakalunch.backend.menu;

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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 손님 사진 (구글 장소 API는 부르지 않음) */
@SpringBootTest
@AutoConfigureMockMvc
class PlacePhotosControllerTest {

    @Autowired MockMvc mvc;
    @MockitoBean PlacePhotosClient client;

    @Test
    void 로그인하면_사진_3장과_올린_사람을_주고_저장하지_않게_함() throws Exception {
        when(client.ready()).thenReturn(true);
        when(client.photos(eq("ChIJ1234567890"), eq(3))).thenReturn(List.of(
                new PlacePhotosClient.Photo("https://lh3.googleusercontent.com/a", "Aiko", "https://maps.google.com/contrib/1",
                        "https://www.google.com/maps/place//data=!3m4!1e2")));
        mvc.perform(get("/api/places/ChIJ1234567890/photos").with(jwt()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.photos[0].url").value("https://lh3.googleusercontent.com/a"))
                .andExpect(jsonPath("$.photos[0].author").value("Aiko"))
                .andExpect(jsonPath("$.photos[0].mapsUri").value("https://www.google.com/maps/place//data=!3m4!1e2"));
    }

    @Test
    void 로그인_없으면_401_이상한_ID는_404_키가_없으면_빈_목록() throws Exception {
        mvc.perform(get("/api/places/ChIJ1234567890/photos")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/places/short/photos").with(jwt())).andExpect(status().isNotFound());
        when(client.ready()).thenReturn(false);
        mvc.perform(get("/api/places/ChIJ1234567890/photos").with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.photos.length()").value(0));
        verify(client, never()).photos(anyString(), anyInt());
    }

    @Test
    void 하루_장_수_한도_안에서만_받고_다음_날_다시() {
        Clock[] now = {Clock.fixed(Instant.parse("2026-11-17T03:00:00Z"), ZoneId.of("Asia/Tokyo"))};
        PlacePhotosController c = new PlacePhotosController(client, 7, new Clock() {
            @Override public ZoneId getZone() { return now[0].getZone(); }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now[0].instant(); }
        });
        assertThat(c.take(3)).isEqualTo(3);
        assertThat(c.take(3)).isEqualTo(3);
        assertThat(c.take(3)).isEqualTo(1); // 남은 1장만
        assertThat(c.take(3)).isEqualTo(0);
        now[0] = Clock.fixed(Instant.parse("2026-11-17T15:30:00Z"), ZoneId.of("Asia/Tokyo")); // 오사카 11/18
        assertThat(c.take(3)).isEqualTo(3);
    }
}
