import { ControlsPanel } from '../features/controls/components/ControlsPanel';
import { CameraControls } from '../features/camera/components/CameraControls';

export function PlayModeUI() {
  return (
    <>
      <ControlsPanel />
      <div className="fixed top-8 right-8 z-50 flex gap-2 pointer-events-auto">
        <CameraControls />
      </div>
    </>
  );
}
