import { useState, useEffect, useCallback } from "react";
import { DEFAULT_AUTOQUANT_FORM } from "../constants";
import { loadAutoQuantOptions, loadTimeframeThresholds, saveAutoQuantOptions } from "../api";

export default function useAutoQuantForm() {
  const [form, setForm] = useState(DEFAULT_AUTOQUANT_FORM);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [timeframeProfile, setTimeframeProfile] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load saved options on mount
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const data = await loadAutoQuantOptions();
        setForm((prev) => ({
          ...prev,
          ...data,
        }));
      } catch (err) {
        console.error("Failed to load saved options:", err);
      } finally {
        setOptionsLoaded(true);
      }
    };
    loadOptions();
  }, []);

  // Save options on form change with debouncing
  useEffect(() => {
    if (!optionsLoaded) return undefined;
    const timeoutId = setTimeout(async () => {
      try {
        await saveAutoQuantOptions(form);
      } catch (err) {
        console.error("Failed to save options:", err);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [form, optionsLoaded]);

  const applyTimeframeThresholds = useCallback(async (tf) => {
    try {
      const data = await loadTimeframeThresholds(tf);
      setTimeframeProfile(data);
      setForm((prev) => ({
        ...prev,
        min_oos_profit: data.min_oos_profit,
        max_drawdown_threshold: data.max_drawdown_threshold,
        min_win_rate: data.min_win_rate,
        min_profit_factor: data.min_profit_factor,
        min_sharpe: data.min_sharpe,
      }));
    } catch (err) {
      console.debug("Failed to apply timeframe thresholds:", err);
    }
  }, []);

  useEffect(() => {
    const apply = async () => {
      await applyTimeframeThresholds(form.timeframe);
    };
    apply();
  }, [form.timeframe, applyTimeframeThresholds]);

  const updateField = useCallback((field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }))
  , []);

  const toggleSpace = useCallback((space) => {
    setForm((prev) => ({
      ...prev,
      hyperopt_spaces: prev.hyperopt_spaces.includes(space)
        ? prev.hyperopt_spaces.filter((s) => s !== space)
        : [...prev.hyperopt_spaces, space]
    }));
  }, []);

  return {
    form,
    setForm,
    updateField,
    toggleSpace,
    timeframeProfile,
    showAdvanced,
    setShowAdvanced,
    optionsLoaded,
  };
}
