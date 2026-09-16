// components/Filters/DateRangeFilter.jsx
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import TextField from "@mui/material/TextField";
import { getDateBounds } from "../../service/dashboardApi";
import { useDateRange, GEOGRAPHY_OPTIONS } from "../../context/DateRangeContext.jsx";

const MS_PER_DAY = 86400000;

function parseISO(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / MS_PER_DAY);
}

function formatDate(date) {
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

function monthLabel(date) {
  const label = date.toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function clampRange(offset, minOffset, maxOffset) {
  return Math.min(Math.max(offset, minOffset), maxOffset);
}

// Estilo dos inputs de data "De"/"Até" — usa cores relativas ao tema MUI
// ativo (ver MuiThemeBridge em main.jsx, que segue o mesmo claro/escuro
// escolhido no botão do header) em vez de hex fixos, senão o campo fica
// sempre escuro mesmo em light mode.
const dateFieldSx = (theme) => ({
  "& .MuiInputLabel-root": { color: theme.palette.text.secondary },
  "& .MuiOutlinedInput-root": {
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.background.paper,
    "& fieldset": { borderColor: theme.palette.divider },
    "&:hover fieldset": { borderColor: theme.palette.text.secondary },
    "&.Mui-focused fieldset": { borderColor: "#4f7fff" },
  },
  "& input::-webkit-calendar-picker-indicator": {
    filter: theme.palette.mode === "dark" ? "invert(0.7)" : "none",
  },
});

/**
 * Filtro de intervalo de datas — partilhado entre Visão Geral, Report
 * SLAs e AIOPER via DateRangeContext (ver context/DateRangeContext.jsx):
 * mudar o período numa página muda nas outras também, porque todas leem
 * o mesmo estado em vez de cada uma ter o seu próprio filtro isolado.
 *
 * Slider de 2 pontas (dias, desde a data mais antiga até a mais recente
 * com dado real na BD) + atalhos (Hoje / Semana / Mês / Trimestre / Ano
 * / Tudo), todos calculados a partir da última data disponível, não da
 * data real de hoje — os dados são históricos, "hoje" pro slider é "a
 * última vez que o fetch gravou algo".
 */
export default function DateRangeFilter() {
  const { range: ctxRange, setRange: setCtxRange, region, setRegion } = useDateRange();

  const { data: bounds, isLoading, isError } = useQuery({
    queryKey: ["date-bounds"],
    queryFn: getDateBounds,
  });

  const minDate = useMemo(() => (bounds ? parseISO(bounds.min_date) : null), [bounds]);
  const maxDate = useMemo(() => (bounds ? parseISO(bounds.max_date) : null), [bounds]);
  const totalDays = useMemo(() => (minDate && maxDate ? diffDays(minDate, maxDate) : 0), [minDate, maxDate]);

  const [dayRange, setDayRange] = useState(null); // [startOffset, endOffset] em dias desde minDate

  useEffect(() => {
    if (!minDate || !maxDate) return;
    if (ctxRange) {
      // Já existe seleção partilhada (veio de outra página) — usa-a.
      const start = clampRange(diffDays(minDate, parseISO(ctxRange.start)), 0, totalDays);
      const end = clampRange(diffDays(minDate, parseISO(ctxRange.end)), 0, totalDays);
      setDayRange([start, end]);
      return;
    }
    if (dayRange === null) {
      // Sem seleção ainda em lado nenhum — padrão: mês corrente.
      const startOfThisMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
      const start = clampRange(diffDays(minDate, startOfThisMonth), 0, totalDays);
      const initial = [start, totalDays];
      setDayRange(initial);
      setCtxRange({ start: toISO(addDays(minDate, initial[0])), end: toISO(addDays(minDate, initial[1])) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, maxDate]);

  const commitRange = (next) => {
    setDayRange(next);
    if (minDate) {
      setCtxRange({ start: toISO(addDays(minDate, next[0])), end: toISO(addDays(minDate, next[1])) });
    }
  };

  // Inputs de data "De"/"Até" — permitem escrever ou escolher no
  // calendário nativo um dia exato (ex: 2026-03-14), coisa que o slider
  // sozinho não consegue fazer com precisão. Ficam sincronizados com o
  // slider: mudar um atualiza o outro, porque os dois escrevem no mesmo
  // estado (dayRange / contexto partilhado).
  const handleStartInput = (e) => {
    const value = e.target.value;
    if (!value || !minDate) return;
    const start = clampRange(diffDays(minDate, parseISO(value)), 0, dayRange[1]);
    commitRange([start, dayRange[1]]);
  };

  const handleEndInput = (e) => {
    const value = e.target.value;
    if (!value || !minDate) return;
    const end = clampRange(diffDays(minDate, parseISO(value)), dayRange[0], totalDays);
    commitRange([dayRange[0], end]);
  };

  if (isLoading) return <p className="text-slate-500 text-sm">A carregar intervalo de datas...</p>;
  if (isError || !bounds) return <p className="text-rose-400 text-sm">Erro ao buscar intervalo de datas disponível.</p>;
  if (!dayRange) return null;

  const applyPreset = (days) => {
    const end = totalDays;
    const start = days === null ? 0 : clampRange(totalDays - days, 0, totalDays);
    commitRange([start, end]);
  };

  const applyMonthPreset = () => {
    const start = clampRange(diffDays(minDate, new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)), 0, totalDays);
    commitRange([start, totalDays]);
  };

  const applyQuarterPreset = () => {
    const quarterStartMonth = Math.floor(maxDate.getMonth() / 3) * 3;
    const start = clampRange(diffDays(minDate, new Date(maxDate.getFullYear(), quarterStartMonth, 1)), 0, totalDays);
    commitRange([start, totalDays]);
  };

  const applyYearPreset = () => {
    const start = clampRange(diffDays(minDate, new Date(maxDate.getFullYear(), 0, 1)), 0, totalDays);
    commitRange([start, totalDays]);
  };

  // RESOLVIDO (pedido do utilizador: "uma maneira mais friendly...
  // escolher logo os meses ou o ano"): marcas clicáveis no próprio
  // slider (um mês = um clique no nome dele, em vez de arrastar as duas
  // pontas à mão) + um ano inteiro por clique quando o histórico
  // abranger mais que um. `selectMonth`/`selectYear` fixam sempre o
  // intervalo COMPLETO desse mês/ano, cortado pelos limites reais de
  // dados (minDate/maxDate) — um mês a meio (ex: o mês corrente, ainda
  // incompleto) fica só até maxDate, não inventa dias futuros sem dado.
  const selectMonth = (monthStart) => {
    const start = clampRange(diffDays(minDate, monthStart), 0, totalDays);
    const end = clampRange(diffDays(minDate, endOfMonth(monthStart)), 0, totalDays);
    commitRange([start, end]);
  };

  const selectYear = (year) => {
    const start = clampRange(diffDays(minDate, new Date(year, 0, 1)), 0, totalDays);
    const end = clampRange(diffDays(minDate, new Date(year, 11, 31)), 0, totalDays);
    commitRange([start, end]);
  };

  const monthMarks = [];
  {
    let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) {
      monthMarks.push(new Date(cursor));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  }
  const years = [...new Set(monthMarks.map((d) => d.getFullYear()))];

  const isMonthActive = (monthStart) =>
    dayRange[0] === clampRange(diffDays(minDate, monthStart), 0, totalDays) &&
    dayRange[1] === clampRange(diffDays(minDate, endOfMonth(monthStart)), 0, totalDays);

  const isYearActive = (year) =>
    dayRange[0] === clampRange(diffDays(minDate, new Date(year, 0, 1)), 0, totalDays) &&
    dayRange[1] === clampRange(diffDays(minDate, new Date(year, 11, 31)), 0, totalDays);

  const presetBtnClass = "px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors border border-slate-300 dark:border-slate-700";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-white">{formatDate(addDays(minDate, dayRange[0]))}</span>
          {" — "}
          <span className="font-semibold text-slate-800 dark:text-white">{formatDate(addDays(minDate, dayRange[1]))}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={presetBtnClass} onClick={() => applyPreset(0)}>Hoje</button>
          <button className={presetBtnClass} onClick={() => applyPreset(6)}>Semana</button>
          <button className={presetBtnClass} onClick={applyMonthPreset}>Mês</button>
          <button className={presetBtnClass} onClick={applyQuarterPreset}>Trimestre</button>
          <button className={presetBtnClass} onClick={applyYearPreset}>Ano</button>
          <button className={presetBtnClass} onClick={() => applyPreset(null)}>Tudo</button>
        </div>
      </div>

      {/* Datas exatas (escrever ou escolher no calendário nativo) + geografia */}
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="De"
          type="date"
          size="small"
          value={toISO(addDays(minDate, dayRange[0]))}
          onChange={handleStartInput}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: toISO(minDate), max: toISO(addDays(minDate, dayRange[1])) } }}
          sx={dateFieldSx}
        />
        <TextField
          label="Até"
          type="date"
          size="small"
          value={toISO(addDays(minDate, dayRange[1]))}
          onChange={handleEndInput}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: toISO(addDays(minDate, dayRange[0])), max: toISO(maxDate) } }}
          sx={dateFieldSx}
        />

        <ToggleButtonGroup
          value={region}
          exclusive
          size="small"
          onChange={(_, value) => value && setRegion(value)}
          sx={(theme) => ({
            ml: { sm: "auto" },
            "& .MuiToggleButton-root": {
              color: theme.palette.text.secondary,
              borderColor: theme.palette.divider,
              textTransform: "none",
              fontSize: "0.75rem",
              padding: "5px 12px",
            },
            "& .MuiToggleButton-root.Mui-selected": {
              color: "#fff",
              backgroundColor: "#4f7fff",
              "&:hover": { backgroundColor: "#3f6fef" },
            },
          })}
        >
          {GEOGRAPHY_OPTIONS.map((opt) => (
            <ToggleButton key={opt} value={opt}>
              {opt}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      <Slider
        value={dayRange}
        onChange={(_, value) => setDayRange(value)}
        onChangeCommitted={(_, value) => commitRange(value)}
        min={0}
        max={totalDays}
        step={1}
        disableSwap
        valueLabelDisplay="off"
        // MUI marca a marca/label do slider como aria-hidden por padrão
        // (assume ser só texto decorativo) — como agora tem um <button>
        // interativo lá dentro (selectMonth), isso escondia-o de
        // leitores de ecrã sem aviso nenhum. slotProps.markLabel
        // sobrepõe-se ao aria-hidden fixo do MUI (spread depois dele no
        // código-fonte do Slider).
        slotProps={{ markLabel: { "aria-hidden": false } }}
        marks={monthMarks.map((monthStart) => ({
          value: clampRange(diffDays(minDate, monthStart), 0, totalDays),
          label: (
            <button
              type="button"
              onClick={() => selectMonth(monthStart)}
              title={`Selecionar ${monthLabel(monthStart)} de ${monthStart.getFullYear()}`}
              className={`text-[11px] font-medium px-1 rounded transition-colors ${
                isMonthActive(monthStart)
                  ? "text-white bg-[#4f7fff]"
                  : "text-slate-500 dark:text-slate-400 hover:text-white hover:bg-[#4f7fff]/70"
              }`}
            >
              {monthLabel(monthStart)}
            </button>
          ),
        }))}
        sx={(theme) => ({
          color: "#4f7fff",
          "& .MuiSlider-thumb": { width: 16, height: 16, zIndex: 2 },
          "& .MuiSlider-rail": { backgroundColor: theme.palette.divider, opacity: 1 },
          "& .MuiSlider-mark": { width: 2, height: 8, backgroundColor: theme.palette.divider },
          "& .MuiSlider-markLabel": { top: 24 },
        })}
      />
      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-3">
        <span>{formatDate(minDate)}</span>
        {years.length > 0 && (
          <div className="flex gap-1.5">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => selectYear(year)}
                title={`Selecionar o ano ${year}`}
                className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                  isYearActive(year)
                    ? "text-white bg-[#4f7fff]"
                    : "text-slate-500 dark:text-slate-400 hover:text-white hover:bg-[#4f7fff]/70"
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        )}
        <span>{formatDate(maxDate)}</span>
      </div>
    </div>
  );
}
