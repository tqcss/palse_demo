import { useEffect, useState } from "react";

const ENGINE_HEALTH_ENDPOINT = "https://palse-demo.onrender.com/health";
// const ENGINE_HEALTH_ENDPOINT = "http://127.0.0.1:8000/health";

const POLLING_INTERVAL = 5000;
const SUCCESS_DISPLAY_DURATION = 3000;

export default function EngineStatus() {
  const [modelActive, setModelActive] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activated, setActivated] = useState(false);
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let timeout: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const checkEngine = async (initial = false) => {
      const active = await getEngineStatus();

      if (!isMounted) return;

      setChecking(false);
      setInitialCheckComplete(true);

      if (active) {
        // Engine was already active on page load.
        if (initial) {
          setModelActive(true);
          return;
        }

        // Engine became active after being unavailable.
        clearInterval(interval);

        setModelActive(true);
        setActivated(true);

        timeout = setTimeout(() => {
          if (isMounted) {
            setActivated(false);
          }
        }, SUCCESS_DISPLAY_DURATION);

        return;
      }

      // Only start polling if the initial check failed.
      if (initial) {
        interval = setInterval(() => {
          checkEngine();
        }, POLLING_INTERVAL);
      }
    };

    checkEngine(true);

    return () => {
      isMounted = false;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);
  // Hide during the initial check and if already active on page load.
  if (!initialCheckComplete || (modelActive && !activated)) {
    return null;
  }

  return (
    <div
      className={`border rounded-2xl px-8 py-4 flex justify-between items-center transition-all duration-500 ease-in-out ${activated
        ? "bg-green-100 border-green-200 animate-in fade-in zoom-in-95"
        : "bg-amber-100 border-amber-200"
        }`}
    >
      <div>
        <h1 className="font-bold text-theme-ink">
          {activated
            ? "Prediction Engine is ready"
            : checking
              ? "Checking prediction engine status..."
              : "The Prediction Engine is currently starting"}
        </h1>

        <p className="text-xs text-theme-ink-soft">
          {activated
            ? "The prediction engine is now active. Assessments can proceed normally."
            : "Assessments may not immediately receive results. Please wait while the prediction engine initializes."}
        </p>
      </div>

      <div
        className={`material-symbols-outlined ml-1 inline-block text-center ${activated
          ? "text-green-700 animate-in zoom-in duration-300"
          : "animate-spin"
          }`}
      >
        {activated ? "check_circle" : "progress_activity"}
      </div>
    </div>
  );
}

async function getEngineStatus(): Promise<boolean> {
  try {
    const response = await fetch(ENGINE_HEALTH_ENDPOINT, {
      method: "GET",
    });

    return response.ok;
  } catch {
    return false;
  }
}
