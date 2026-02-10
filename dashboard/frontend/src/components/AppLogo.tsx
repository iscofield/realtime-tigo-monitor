import './AppLogo.css';

interface AppLogoProps {
  isMobile: boolean;
}

export function AppLogo({ isMobile }: AppLogoProps) {
  return (
    <div className={`app-logo ${isMobile ? 'app-logo--mobile' : 'app-logo--desktop'}`}>
      <img src="/favicon.png" alt="Realtime Tigo Monitor" />
    </div>
  );
}
