import { useState, useCallback, useMemo } from "react";
import { generateTemplate } from "../api";
import { normalizeStrategies } from "../utils";

export default function useAutoQuantStrategyGen(strategies = []) {
  const [generatedStrategies, setGeneratedStrategies] = useState([]);
  const [generateStatus, setGenerateStatus] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [templateType, setTemplateType] = useState("omni");

  const strategyList = useMemo(() => {
    return normalizeStrategies([...strategies, ...generatedStrategies]);
  }, [generatedStrategies, strategies]);

  const handleGenerateTemplate = useCallback(async (form, updateField) => {
    setIsGenerating(true);
    setGenerateStatus(null);
    const nameMap = {
      catfactory: "CatFactory",
      adaptive: "AdaptiveFactory",
      ensemble: "EnsembleFactory",
      momentum: "MomentumFactory",
      omni: "OmniFactory",
    };
    const name = nameMap[templateType] ?? "OmniFactory";
    const payload = {
      strategy_name: name,
      adaptive: templateType === "adaptive",
      ensemble: templateType === "ensemble",
      momentum: templateType === "momentum",
      omni: templateType === "omni",
      timeframe: form.timeframe,
    };
    try {
      const data = await generateTemplate(payload);
      const newEntry = { strategy_name: data.strategy_name };
      setGeneratedStrategies((prev) =>
        strategyList.some((s) => s.strategy_name === data.strategy_name)
          ? prev
          : [...prev, newEntry]
      );
      updateField("strategy", data.strategy_name);
      setGenerateStatus({ ok: true, message: `Strategy "${data.strategy_name}" created and selected.` });
    } catch (err) {
      setGenerateStatus({ ok: false, message: err.message });
    } finally {
      setIsGenerating(false);
    }
  }, [templateType, strategyList]);

  return {
    generatedStrategies,
    setGeneratedStrategies,
    generateStatus,
    setGenerateStatus,
    isGenerating,
    setIsGenerating,
    templateType,
    setTemplateType,
    strategyList,
    handleGenerateTemplate,
  };
}
