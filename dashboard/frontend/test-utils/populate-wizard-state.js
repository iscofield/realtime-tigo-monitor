/**
 * Test utility: Populate wizard state with sample data.
 *
 * Usage in browser console or Playwright:
 *   - Copy/paste this script into browser console
 *   - Or use with Playwright's browser_evaluate tool
 *   - Then refresh the page and click "Resume Setup"
 *
 * This sets up a wizard state at the validation step with:
 *   - 62 auto-matched panels
 *   - 7 excess panels (B9, B10, F8-F11, G11)
 *   - 7 empty slots (C9, I1-I6)
 */

(() => {
  const state = {
    version: 1,
    savedAt: new Date().toISOString(),
    state: {
      currentStep: 'validation',
      furthestStep: 'validation',
      mqttConfig: { server: '192.168.2.2', port: 1883 },
      systemTopology: {
        version: 1,
        mqtt: { server: '192.168.2.2', port: 1883 },
        ccas: [
          {
            name: 'primary',
            serial_device: '/dev/ttyACM2',
            strings: [
              { name: 'A', panel_count: 8 },
              { name: 'B', panel_count: 8 },
              { name: 'C', panel_count: 9 },
              { name: 'D', panel_count: 8 },
              { name: 'E', panel_count: 8 },
              { name: 'I', panel_count: 6 }
            ]
          },
          {
            name: 'secondary',
            serial_device: '/dev/ttyACM3',
            strings: [
              { name: 'F', panel_count: 7 },
              { name: 'G', panel_count: 10 },
              { name: 'H', panel_count: 5 }
            ]
          }
        ]
      },
      discoveredPanels: {
        // String A (8 panels - all matched) - CCA: primary
        'A1': { serial: '4-C3F23CR', tigo_label: 'A1', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'A2': { serial: '4-C3F2ACK', tigo_label: 'A2', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'A3': { serial: '4-C3F292X', tigo_label: 'A3', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'A4': { serial: '4-C3F202N', tigo_label: 'A4', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'A5': { serial: '4-C4744FK', tigo_label: 'A5', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'A6': { serial: '4-C3F2C5N', tigo_label: 'A6', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'A7': { serial: '4-C3F2C9H', tigo_label: 'A7', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'A8': { serial: '4-C3F208V', tigo_label: 'A8', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        // String B (8 expected + 2 excess: B9, B10) - CCA: primary
        'B1': { serial: '4-C3F290V', tigo_label: 'B1', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B2': { serial: '4-C3F1ACH', tigo_label: 'B2', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B3': { serial: '4-C3F282R', tigo_label: 'B3', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B4': { serial: '4-C3F2CCY', tigo_label: 'B4', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B5': { serial: '4-C3F2CBP', tigo_label: 'B5', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B6': { serial: '4-C3F231W', tigo_label: 'B6', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B7': { serial: '4-C3F2AEM', tigo_label: 'B7', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B8': { serial: '4-C3F2CDX', tigo_label: 'B8', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'B9': { serial: '4-C3F277H', tigo_label: 'B9', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },   // excess
        'B10': { serial: '4-C3F223Z', tigo_label: 'B10', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }, // excess
        // String C (9 expected, only 8 discovered - C9 missing) - CCA: primary
        'C1': { serial: '4-C3F2ABT', tigo_label: 'C1', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'C2': { serial: '4-C3F1BFH', tigo_label: 'C2', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'C3': { serial: '4-C3F211N', tigo_label: 'C3', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'C4': { serial: '4-C3F2A5V', tigo_label: 'C4', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'C5': { serial: '4-C3F269M', tigo_label: 'C5', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'C6': { serial: '4-C3F243J', tigo_label: 'C6', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'C7': { serial: '4-C3F244V', tigo_label: 'C7', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'C8': { serial: '4-C3F247Y', tigo_label: 'C8', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        // String D (8 panels - all matched) - CCA: primary
        'D1': { serial: '4-C3F20AX', tigo_label: 'D1', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'D2': { serial: '4-C3F1F0L', tigo_label: 'D2', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'D3': { serial: '4-C3F2B8T', tigo_label: 'D3', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'D4': { serial: '4-C3F2C8J', tigo_label: 'D4', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'D5': { serial: '4-C3F152N', tigo_label: 'D5', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'D6': { serial: '4-C3F2CAL', tigo_label: 'D6', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'D7': { serial: '4-C3F222W', tigo_label: 'D7', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'D8': { serial: '4-C3F2B9S', tigo_label: 'D8', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        // String E (8 panels - all matched) - CCA: primary
        'E1': { serial: '4-C3F1B5W', tigo_label: 'E1', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'E2': { serial: '4-C3F1F5V', tigo_label: 'E2', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'E3': { serial: '4-C3F162S', tigo_label: 'E3', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'E4': { serial: '4-C3F264H', tigo_label: 'E4', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'E5': { serial: '4-C3F254Y', tigo_label: 'E5', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'E6': { serial: '4-C3F474G', tigo_label: 'E6', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'E7': { serial: '4-C47478M', tigo_label: 'E7', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'E8': { serial: '4-C3EF88G', tigo_label: 'E8', cca: 'primary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        // String I (6 expected, 0 discovered - all missing) - CCA: primary
        // String F (7 expected + 4 excess: F8-F11) - CCA: secondary
        'F1': { serial: '4-C3F48AP', tigo_label: 'F1', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'F2': { serial: '4-C472F6Y', tigo_label: 'F2', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'F3': { serial: '4-C3F096W', tigo_label: 'F3', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'F4': { serial: '4-C3F46FV', tigo_label: 'F4', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'F5': { serial: '4-C47476L', tigo_label: 'F5', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'F6': { serial: '4-C3EF8ET', tigo_label: 'F6', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'F7': { serial: '4-C47479N', tigo_label: 'F7', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'F8': { serial: '4-C3EF8BM', tigo_label: 'F8', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },   // excess
        'F9': { serial: '4-C3F25AZ', tigo_label: 'F9', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },   // excess
        'F10': { serial: '4-C3F268N', tigo_label: 'F10', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }, // excess
        'F11': { serial: '4-C47475H', tigo_label: 'F11', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }, // excess
        // String G (10 expected + 1 excess: G11) - CCA: secondary
        'G1': { serial: '4-C3F34CZ', tigo_label: 'G1', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G2': { serial: '4-C3F28DT', tigo_label: 'G2', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G3': { serial: '4-C3F1F8Z', tigo_label: 'G3', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G4': { serial: '4-C3F2B0H', tigo_label: 'G4', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G5': { serial: '4-C3F27AM', tigo_label: 'G5', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G6': { serial: '4-C3F1E0H', tigo_label: 'G6', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G7': { serial: '4-C3F26CT', tigo_label: 'G7', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G8': { serial: '4-C3F29ET', tigo_label: 'G8', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G9': { serial: '4-C3F293Y', tigo_label: 'G9', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G10': { serial: '4-C3EE48N', tigo_label: 'G10', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'G11': { serial: '4-C3F285H', tigo_label: 'G11', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }, // excess
        // String H (5 panels - all matched) - CCA: secondary
        'H1': { serial: '4-C3D641S', tigo_label: 'H1', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'H2': { serial: '4-C3F1DFW', tigo_label: 'H2', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'H3': { serial: '4-C3F284J', tigo_label: 'H3', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'H4': { serial: '4-C3F20FJ', tigo_label: 'H4', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() },
        'H5': { serial: '4-C3F214S', tigo_label: 'H5', cca: 'secondary', watts: 0, voltage: 0, discovered_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }
      },
      translations: {},
      validationResults: null,
      configDownloaded: true
    }
  };

  localStorage.setItem('solar-tigo-wizard-state', JSON.stringify(state));
  console.log('Wizard state populated. Refresh the page and click "Resume Setup".');
  return 'State set successfully';
})();
