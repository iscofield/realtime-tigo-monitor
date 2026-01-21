/**
 * Visual alignment guides shown during drag operations.
 */

import type { CSSProperties } from 'react';
import type { AlignmentGuide } from '../../types/config';

interface AlignmentGuidesProps {
  guides: AlignmentGuide[];
}

const guideBaseStyle: CSSProperties = {
  position: 'absolute',
  backgroundColor: '#008B8B',
  boxShadow: '0 0 0 1px white',
  pointerEvents: 'none',
  zIndex: 999,
};

export function AlignmentGuides({ guides }: AlignmentGuidesProps) {
  return (
    <>
      {guides.map((guide, index) => {
        if (guide.type === 'vertical') {
          return (
            <div
              key={`v-${index}`}
              style={{
                ...guideBaseStyle,
                left: `${guide.position}px`,
                top: `${guide.start}px`,
                width: '1px',
                height: `${guide.end - guide.start}px`,
              }}
              data-testid="alignment-guide-vertical"
            />
          );
        } else {
          return (
            <div
              key={`h-${index}`}
              style={{
                ...guideBaseStyle,
                left: `${guide.start}px`,
                top: `${guide.position}px`,
                width: `${guide.end - guide.start}px`,
                height: '1px',
              }}
              data-testid="alignment-guide-horizontal"
            />
          );
        }
      })}
    </>
  );
}
