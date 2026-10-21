package com.osakalunch.backend.push;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;

import static com.osakalunch.backend.push.WebPushCrypto.unb64;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WebPushCryptoTest {

    // RFC 8291 5장 예시 값 (https://datatracker.ietf.org/doc/html/rfc8291)
    static final String AS_PUBLIC = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    static final String AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    static final String UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    static final String AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
    static final String SALT = "DGv6ra1nlYgDCS1FRnbzlw";
    static final String BODY = "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

    @Test
    void RFC_8291_예시와_같은_암호문() throws Exception {
        KeyPair as = new KeyPair(WebPushCrypto.publicKey(unb64(AS_PUBLIC)), WebPushCrypto.privateKey(unb64(AS_PRIVATE)));
        byte[] body = WebPushCrypto.encrypt("When I grow up, I want to be a watermelon".getBytes(StandardCharsets.US_ASCII),
                unb64(UA_PUBLIC), unb64(AUTH), as, unb64(SALT));
        assertThat(WebPushCrypto.b64(body)).isEqualTo(BODY);
    }

    @Test
    void 공개_키는_65바이트_그대로_왕복() throws Exception {
        assertThat(WebPushCrypto.b64(WebPushCrypto.uncompressed(WebPushCrypto.publicKey(unb64(UA_PUBLIC))))).isEqualTo(UA_PUBLIC);
        assertThatThrownBy(() -> WebPushCrypto.publicKey(new byte[64])).isInstanceOf(IllegalArgumentException.class);
        byte[] offCurve = unb64(UA_PUBLIC);
        offCurve[64] ^= 1; // y 마지막 비트만 바꿈
        assertThatThrownBy(() -> WebPushCrypto.publicKey(offCurve)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void VAPID_토큰은_우리_키로_ES256_서명() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("EC");
        gen.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair vapid = gen.generateKeyPair();
        String jwt = WebPushCrypto.vapidJwt("https://fcm.googleapis.com", "https://osaka-lunch-app.vercel.app", 1900000000L,
                (ECPrivateKey) vapid.getPrivate());

        String[] parts = jwt.split("\\.");
        assertThat(new String(unb64(parts[0]), StandardCharsets.UTF_8)).isEqualTo("{\"typ\":\"JWT\",\"alg\":\"ES256\"}");
        assertThat(new String(unb64(parts[1]), StandardCharsets.UTF_8))
                .isEqualTo("{\"aud\":\"https://fcm.googleapis.com\",\"exp\":1900000000,\"sub\":\"https://osaka-lunch-app.vercel.app\"}");
        Signature verify = Signature.getInstance("SHA256withECDSAinP1363Format");
        verify.initVerify((ECPublicKey) vapid.getPublic());
        verify.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
        assertThat(verify.verify(unb64(parts[2]))).isTrue();
    }
}
