package com.osakalunch.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 화면은 Supabase 익명 로그인 토큰을 Authorization: Bearer 로 보냄. 서버는 그 토큰만 확인 (세션 없음)
 */
@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain api(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable()) // 쿠키를 쓰지 않는 토큰 방식이라 필요 없음
                .cors(Customizer.withDefaults())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/health").permitAll() // 화면이 앱을 열 때 서버를 깨우는 용도
                        .requestMatchers("/error").permitAll() // 400 · 404 같은 오류 응답이 401로 바뀌지 않게
                        .requestMatchers(HttpMethod.POST, "/internal/push/send-due").permitAll() // 로그인 대신 비밀 값으로 확인 (PushController)
                        .requestMatchers(HttpMethod.GET, "/api/i18n/*").permitAll() // 앱 문구 번역 (누구에게나 같은 내용, 로그인 전에 필요)
                        .anyRequest().authenticated())
                .oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()));
        return http.build();
    }

    /**
     * Supabase 토큰 확인. 프로젝트가 새 서명 키(비대칭)를 쓰면 공개 키 목록(JWKS)으로,
     * 예전 JWT 비밀키만 있으면 SUPABASE_JWT_SECRET 으로 확인. 발급처(iss)와 대상(aud=authenticated)도 확인
     */
    @Bean
    JwtDecoder jwtDecoder(@Value("${supabase.url}") String supabaseUrl,
                          @Value("${supabase.jwt-secret:}") String jwtSecret) {
        String issuer = supabaseUrl.replaceAll("/+$", "") + "/auth/v1";
        NimbusJwtDecoder decoder = jwtSecret.isBlank()
                ? NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json")
                        .jwsAlgorithm(SignatureAlgorithm.ES256)
                        .jwsAlgorithm(SignatureAlgorithm.RS256)
                        .build()
                : NimbusJwtDecoder.withSecretKey(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
                        .macAlgorithm(MacAlgorithm.HS256)
                        .build();
        JwtClaimValidator<List<String>> audience =
                new JwtClaimValidator<>(JwtClaimNames.AUD, aud -> aud != null && aud.contains("authenticated"));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<Jwt>(JwtValidators.createDefaultWithIssuer(issuer), audience));
        return decoder;
    }

    /** 화면 주소: 운영 · Vercel 미리보기 · 내 컴퓨터 */
    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.origin-patterns}") List<String> originPatterns) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOriginPatterns(originPatterns);
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }
}
