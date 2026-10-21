package com.osakalunch.backend.i18n;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TranslatorTest {

    static final Map<String, String> SOURCE = Map.of("common.walk", "걸어서 {n}분", "home.spin", "오늘 점심 정해줘");

    @Test
    void 키와_자리가_원문과_같아야_씀() {
        assertThat(Translator.sameShape(SOURCE, Map.of("common.walk", "Đi bộ {n} phút", "home.spin", "Chọn bữa trưa"))).isTrue();
        assertThat(Translator.sameShape(SOURCE, Map.of("common.walk", "Đi bộ phút", "home.spin", "Chọn bữa trưa"))).isFalse(); // {n} 빠짐
        assertThat(Translator.sameShape(SOURCE, Map.of("common.walk", "Đi bộ {m} phút", "home.spin", "Chọn bữa trưa"))).isFalse(); // 이름이 다름
        assertThat(Translator.sameShape(SOURCE, Map.of("common.walk", "Đi bộ {n} phút"))).isFalse(); // 키 빠짐
        assertThat(Translator.sameShape(SOURCE, Map.of("common.walk", "Đi bộ {n} phút", "home.spin", " "))).isFalse(); // 빈 문구
        assertThat(Translator.sameShape(SOURCE, Map.of("common.walk", "Đi bộ {n} phút", "home.spin", "x".repeat(300)))).isFalse(); // 터무니없이 김
    }

    @Test
    void 코드_블록으로_감싸_와도_JSON만_꺼냄() {
        ObjectMapper json = new ObjectMapper();
        assertThat(Translator.parse(json, "```json\n{\"a\":\"b\"}\n```")).containsEntry("a", "b");
        assertThat(Translator.parse(json, "번역할 수 없어요")).isNull();
        assertThat(Translator.parse(json, "{\"a\":{\"b\":\"c\"}}")).isNull(); // 평평한 문자열 객체만
    }

    @Test
    void 이하는_그_금액을_포함한다고_지시() {
        // 10/21 베트남어 번역에서 '이하'를 '미만(dưới)'으로 옮긴 문구 8/11 → 지시문에 규칙 추가 (PROMPT_VERSION 2)
        assertThat(Translator.PROMPT).contains("이하 means \"or less\"").contains("never as \"under\"");
    }

    @Test
    void 언어_이름은_영어로() {
        assertThat(Translator.languageName("vi")).isEqualTo("Vietnamese (vi)");
        assertThat(Translator.languageName("zh-Hant")).startsWith("Chinese");
    }
}
