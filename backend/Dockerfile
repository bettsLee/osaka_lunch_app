# 빌드 스테이지
FROM eclipse-temurin:17-jdk-alpine AS builder
WORKDIR /app
COPY gradlew .
COPY gradle gradle
COPY build.gradle .
COPY settings.gradle .
COPY src src
RUN chmod +x gradlew && ./gradlew bootJar -x test --no-daemon

# 실행 스테이지
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/build/libs/*.jar app.jar
EXPOSE 8080
# -XX:-UseBASE64Intrinsics: Java4Shell(CVE-2026-114938, 11/17 공개) 임시 막기. AVX-512 VBMI CPU에서 빠른 Base64 디코더가 버퍼 밖에 씀
#   → 그 빠른 경로만 끔 (표준 디코더 사용, 우리 사용량에서 속도 차이 없음). Temurin 17 패치 빌드가 나오면 다시 빌드하고 이 옵션을 뺌 (11/18 상권 결정)
ENTRYPOINT ["java", "-XX:-UseBASE64Intrinsics", "-jar", "app.jar"]
