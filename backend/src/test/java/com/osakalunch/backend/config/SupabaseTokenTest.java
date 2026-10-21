package com.osakalunch.backend.config;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 진짜 토큰 확인 경로: 예전 JWT 비밀키(HS256) 방식으로 발급처 · 대상까지 확인하는지 */
@SpringBootTest(properties = {
        "supabase.url=https://example-project.supabase.co",
        "supabase.jwt-secret=" + SupabaseTokenTest.SECRET,
})
@AutoConfigureMockMvc
class SupabaseTokenTest {

    static final String SECRET = "test-only-secret-at-least-32-bytes-long!!";

    @Autowired MockMvc mvc;

    String token(String issuer, String audience, String secret, Instant expires) throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(UUID.randomUUID().toString())
                .issuer(issuer)
                .audience(audience)
                .claim("role", "authenticated")
                .claim("is_anonymous", true)
                .expirationTime(Date.from(expires))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(secret));
        return jwt.serialize();
    }

    int call(String token) throws Exception {
        return mvc.perform(get("/api/visits/pending").header("Authorization", "Bearer " + token))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void 우리_프로젝트_익명_로그인_토큰만_통과() throws Exception {
        String issuer = "https://example-project.supabase.co/auth/v1";
        Instant later = Instant.now().plusSeconds(600);
        org.assertj.core.api.Assertions.assertThat(call(token(issuer, "authenticated", SECRET, later))).isEqualTo(204);
        org.assertj.core.api.Assertions.assertThat(call(token("https://other.supabase.co/auth/v1", "authenticated", SECRET, later))).isEqualTo(401);
        org.assertj.core.api.Assertions.assertThat(call(token(issuer, "anon", SECRET, later))).isEqualTo(401);
        org.assertj.core.api.Assertions.assertThat(call(token(issuer, "authenticated", SECRET.replace('t', 'x'), later))).isEqualTo(401);
        org.assertj.core.api.Assertions.assertThat(call(token(issuer, "authenticated", SECRET, Instant.now().minusSeconds(600)))).isEqualTo(401);
    }
}
