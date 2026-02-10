import './AppLogo.css';

interface AppLogoProps {
  size?: number;
  floating?: boolean;
}

export function AppLogo({ size = 32, floating = false }: AppLogoProps) {
  return (
    <div className={`app-logo${floating ? ' app-logo--floating' : ''}`}>
      <img
        src="/favicon.png"
        alt="Realtime Tigo Monitor"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
