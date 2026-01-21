/**
 * CCA section component.
 * Shows all strings for a CCA device.
 */

import { useState } from 'react';
import { StringGroup } from './StringGroup';
import type { CCAInfo, MappingResult } from './computePanelMapping';
import { stringHasIssues } from './computePanelMapping';
import type { DiscoveredPanel } from '../../../../types/config';
import {
  ccaSectionStyle,
  ccaHeaderStyle,
  ccaContentStyle,
} from './MappingStyles';

interface CCASectionProps {
  ccaInfo: CCAInfo;
  mapping: MappingResult;
  discoveredPanels: Record<string, DiscoveredPanel>;
  /** Callback to remove a panel (move to unassigned) */
  onRemove?: (tigoLabel: string) => void;
}

export function CCASection({ ccaInfo, mapping, discoveredPanels, onRemove }: CCASectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpanded = () => setIsExpanded(!isExpanded);

  return (
    <div style={ccaSectionStyle}>
      <div style={ccaHeaderStyle} onClick={toggleExpanded}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#666' }}>
            {isExpanded ? '▼' : '▶'}
          </span>
          <span style={{ fontWeight: 600 }}>{ccaInfo.name}</span>
          <span style={{ fontSize: '12px', color: '#888' }}>
            ({ccaInfo.serialDevice})
          </span>
        </div>
        <div style={{ fontSize: '13px', color: '#666' }}>
          {ccaInfo.totalAssigned} / {ccaInfo.totalExpected} panels
        </div>
      </div>

      {isExpanded && (
        <div style={ccaContentStyle}>
          {ccaInfo.strings.map(stringInfo => (
            <StringGroup
              key={stringInfo.name}
              stringInfo={stringInfo}
              mapping={mapping}
              hasIssues={stringHasIssues(stringInfo, mapping, discoveredPanels)}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
