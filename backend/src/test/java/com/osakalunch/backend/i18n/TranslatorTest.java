package com.osakalunch.backend.i18n;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TranslatorTest {

    static final Map<String, String> SOURCE = Map.of("common.walk", "걸어서 {n}분", "home.spin", "오늘 점심 정해줘");

    @Test
    void 키와_자리가_원문과_같은_줄만_씀() {
        assertThat(Translator.valid(SOURCE, Map.of("common.walk", "Đi bộ {n} phút", "home.spin", "Chọn bữa trưa"))).hasSize(2);
        assertThat(Translator.valid(SOURCE, Map.of("common.walk", "Đi bộ phút", "home.spin", "Chọn bữa trưa"))).containsOnlyKeys("home.spin"); // {n} 빠짐
        assertThat(Translator.valid(SOURCE, Map.of("common.walk", "Đi bộ {m} phút", "home.spin", "Chọn bữa trưa"))).containsOnlyKeys("home.spin"); // 이름이 다름
        assertThat(Translator.valid(SOURCE, Map.of("common.walk", "Đi bộ {n} phút"))).containsOnlyKeys("common.walk"); // 키 빠짐
        assertThat(Translator.valid(SOURCE, Map.of("common.walk", "Đi bộ {n} phút", "home.spin", " "))).containsOnlyKeys("common.walk"); // 빈 문구
        assertThat(Translator.valid(SOURCE, Map.of("common.walk", "Đi bộ {n} phút", "home.spin", "x".repeat(300)))).containsOnlyKeys("common.walk"); // 터무니없이 김
        assertThat(Translator.valid(SOURCE, Map.of("common.walk", "Đi bộ {n} phút", "x.extra", "덤"))).doesNotContainKey("x.extra"); // 원문에 없는 키
    }

    /** 원문 n줄 (k0 = "문구 0 {n}", …) */
    static Map<String, String> source(int n) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < n; i++) m.put("k" + i, "문구 " + i + " {n}");
        return m;
    }

    /** 가짜 Gemini: 질문 속 JSON을 꺼내 'T:'를 붙여 돌려줌. broken에 든 키는 {자리}를 빼고 돌려줌 (fixOnRetry면 두 번째 물을 때는 고쳐 줌) */
    static Translator fake(List<Integer> asked, Set<String> broken, boolean fixOnRetry) {
        ObjectMapper json = new ObjectMapper();
        Set<String> seen = Collections.synchronizedSet(new java.util.HashSet<>());
        return new Translator(json, "test-key", "test-model") {
            @Override
            String call(String prompt) {
                Map<String, String> in = Translator.parse(json, prompt.substring(prompt.indexOf("JSON:")));
                asked.add(in.size());
                Map<String, String> out = new LinkedHashMap<>();
                in.forEach((k, v) -> {
                    boolean again = !seen.add(k);
                    out.put(k, broken.contains(k) && !(fixOnRetry && again) ? "T: 틀림" : "T: " + v);
                });
                try {
                    return "```json\n" + json.writeValueAsString(out) + "\n```";
                } catch (Exception e) {
                    throw new IllegalStateException(e);
                }
            }
        };
    }

    @Test
    void 문구를_60줄씩_나눠_묻고_틀린_줄만_다시_물음() throws Exception {
        List<Integer> asked = Collections.synchronizedList(new ArrayList<>());
        Map<String, String> src = source(342); // 11/19 원문 줄 수
        Map<String, String> out = fake(asked, Set.of("k5", "k200"), true).translate(src, "zh-Hant");
        assertThat(out).hasSize(342);
        assertThat(new ArrayList<>(out.keySet())).isEqualTo(new ArrayList<>(src.keySet())); // 원문 순서대로
        assertThat(out.get("k5")).isEqualTo("T: 문구 5 {n}");
        assertThat(asked).containsExactlyInAnyOrder(60, 60, 60, 60, 60, 42, 1, 1); // 60줄씩 6묶음 + 틀린 두 줄만 다시
    }

    @Test
    void 끝내_틀린_줄은_빼고_쓰고_너무_많이_빠지면_실패() throws Exception {
        Map<String, String> out = fake(Collections.synchronizedList(new ArrayList<>()), Set.of("k7"), false).translate(source(130), "ja");
        assertThat(out).hasSize(129).doesNotContainKey("k7"); // 빠진 줄은 화면이 영어로 채움
        Set<String> many = new java.util.HashSet<>();
        for (int i = 0; i < 20; i++) many.add("k" + i);
        assertThatThrownBy(() -> fake(Collections.synchronizedList(new ArrayList<>()), many, false).translate(source(130), "ja"))
                .isInstanceOf(Translator.TranslationFailed.class); // 110/130 < 90%
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
