import type { CSSProperties } from 'react';
import { LayoutGrid, Table } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';

export type TabType = 'layout' | 'table';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const mobileNavStyle: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  height: '56px',
  display: 'flex',
  backgroundColor: '#333',
  borderTop: '1px solid #555',
  zIndex: 1000,
};

const mobileButtonBaseStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  border: 'none',
  minHeight: '44px',
  cursor: 'pointer',
  fontSize: '12px',
  gap: '2px',
};

const desktopNavStyle: CSSProperties = {
  display: 'flex',
  backgroundColor: '#444',
  borderBottom: '1px solid #555',
};

const desktopButtonBaseStyle: CSSProperties = {
  padding: '12px 24px',
  color: 'white',
  border: 'none',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  // FR-8.1: Mobile breakpoint at < 768px
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (isMobile) {
    return (
      <nav style={mobileNavStyle} aria-label="Main navigation">
        <button
          data-testid="layout-tab"
          onClick={() => onTabChange('layout')}
          style={{
            ...mobileButtonBaseStyle,
            backgroundColor: activeTab === 'layout' ? '#444' : 'transparent',
          }}
          aria-current={activeTab === 'layout' ? 'page' : undefined}
        >
          <LayoutGrid size={20} />
          <span>Layout</span>
        </button>
        <button
          data-testid="table-tab"
          onClick={() => onTabChange('table')}
          style={{
            ...mobileButtonBaseStyle,
            backgroundColor: activeTab === 'table' ? '#444' : 'transparent',
          }}
          aria-current={activeTab === 'table' ? 'page' : undefined}
        >
          <Table size={20} />
          <span>Table</span>
        </button>
      </nav>
    );
  }

  return (
    <nav style={desktopNavStyle} aria-label="Main navigation">
      <button
        data-testid="layout-tab"
        onClick={() => onTabChange('layout')}
        style={{
          ...desktopButtonBaseStyle,
          backgroundColor: activeTab === 'layout' ? '#555' : 'transparent',
          borderBottom: activeTab === 'layout' ? '2px solid #4CAF50' : '2px solid transparent',
        }}
        aria-current={activeTab === 'layout' ? 'page' : undefined}
      >
        <LayoutGrid size={18} />
        Layout View
      </button>
      <button
        data-testid="table-tab"
        onClick={() => onTabChange('table')}
        style={{
          ...desktopButtonBaseStyle,
          backgroundColor: activeTab === 'table' ? '#555' : 'transparent',
          borderBottom: activeTab === 'table' ? '2px solid #4CAF50' : '2px solid transparent',
        }}
        aria-current={activeTab === 'table' ? 'page' : undefined}
      >
        <Table size={18} />
        Table View
      </button>
    </nav>
  );
}
