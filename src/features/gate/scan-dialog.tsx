import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { scanningSupported } from "@/lib/gate";

/**
 * Scan a pass with the phone's camera.
 *
 * It uses the browser's own `BarcodeDetector`, which is on Chrome and Edge for
 * Android and desktop and not on iPhone's Safari. That is a deliberate limit:
 * a JavaScript QR decoder would be a dependency, and the gate has a complete
 * fallback - search by name, flat or booking code, or paste the code a
 * keyboard-style scanner types. Where scanning is unavailable the button says
 * so rather than failing after it is pressed.
 *
 * The camera is stopped the moment the dialog closes or a code is read; leaving
 * it running drains a volunteer's battery and keeps the camera light on.
 */

type DetectedCode = { rawValue?: string };
type Detector = { detect: (source: HTMLVideoElement) => Promise<DetectedCode[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

export function ScanDialog({
  open,
  onOpenChange,
  onScan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (value: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!scanningSupported()) {
      setError("This browser cannot scan QR codes. Close this and search by name, flat or booking code instead.");
      return;
    }

    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();

        const Detector = (window as unknown as { BarcodeDetector: DetectorConstructor }).BarcodeDetector;
        const detector = new Detector({ formats: ["qr_code"] });

        const look = async () => {
          if (stopped || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            const value = codes.find((code) => code.rawValue)?.rawValue;
            if (value) {
              onScan(value);
              return;
            }
          } catch {
            /* a frame that cannot be read is just a frame */
          }
          // About eight looks a second: plenty to catch a held-up phone.
          timer = window.setTimeout(() => void look(), 125);
        };
        void look();
      } catch {
        setError("The camera could not be opened. Allow camera access for this site, or search instead.");
      }
    }

    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, onScan]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan a pass</DialogTitle>
          <p className="text-sm text-muted-foreground">Hold the resident&rsquo;s QR code inside the picture.</p>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <video ref={video} playsInline muted className="aspect-square w-full rounded-lg bg-black object-cover" aria-label="Camera view" />
        )}
        <Button type="button" variant="outline" className="h-12" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
