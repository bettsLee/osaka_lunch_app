import HomeScreen from "@/components/HomeScreen";
import I18nProvider from "@/components/I18n";

export default function Home() {
  return (
    <I18nProvider>
      <HomeScreen />
    </I18nProvider>
  );
}
