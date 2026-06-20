import { useState, useMemo, useCallback } from "react";
import { ArrowUpIcon, ArrowDownIcon, FunnelIcon } from "@heroicons/react/24/outline";

const DataTableTab = ({ run }) => {
  const report = run.report || {};
  const risk = report.risk_assessment || {};
  const stressTest = report.stress_test || {};
  const perPair = stressTest.per_pair || [];

  // Table state
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Generate comprehensive metrics data
  const generateMetricsData = useCallback(() => {
    const baseMetrics = [
      {
        category: 'Performance',
        metric: 'In-Sample Profit',
        value: report.sanity_backtest?.profit_total_abs || 0,
        format: 'currency',
        threshold: 0,
        isHigherBetter: true,
      },
      {
        category: 'Performance',
        metric: 'OOS Profit %',
        value: (report.oos_validation?.profit_total || 0) * 100,
        format: 'percentage',
        threshold: (report.thresholds?.min_oos_profit || 0) * 100,
        isHigherBetter: true,
      },
      {
        category: 'Risk',
        metric: 'Max Drawdown',
        value: risk.max_drawdown_pct || 0,
        format: 'percentage',
        threshold: report.thresholds?.max_drawdown || 30,
        isHigherBetter: false,
      },
      {
        category: 'Risk',
        metric: 'Win Rate',
        value: risk.win_rate_pct || 0,
        format: 'percentage',
        threshold: report.thresholds?.min_win_rate || 40,
        isHigherBetter: true,
      },
      {
        category: 'Risk',
        metric: 'Sharpe Ratio',
        value: risk.sharpe_ratio || 0,
        format: 'ratio',
        threshold: report.thresholds?.min_sharpe || 0.5,
        isHigherBetter: true,
      },
      {
        category: 'Risk',
        metric: 'Profit Factor',
        value: risk.profit_factor || 0,
        format: 'ratio',
        threshold: report.thresholds?.min_profit_factor || 1.3,
        isHigherBetter: true,
      },
      {
        category: 'Trading',
        metric: 'Total Trades',
        value: risk.total_trades || 0,
        format: 'number',
        threshold: 200,
        isHigherBetter: true,
      },
      {
        category: 'Monte Carlo',
        metric: 'P95 Drawdown',
        value: (risk.monte_carlo?.p95_drawdown || 0) * 100,
        format: 'percentage',
        threshold: (report.thresholds?.monte_carlo_threshold || 0.35) * 100,
        isHigherBetter: false,
      },
      {
        category: 'Monte Carlo',
        metric: 'Median Return',
        value: (risk.monte_carlo?.median_final_return || 0) * 100,
        format: 'percentage',
        threshold: 0,
        isHigherBetter: true,
      },
    ];

    // Add per-pair data if available
    if (perPair.length > 0) {
      perPair.forEach((pair) => {
        baseMetrics.push({
          category: 'Per-Pair',
          metric: `${pair.key} Profit`,
          value: pair.profit_total || 0,
          format: 'currency',
          threshold: 0,
          isHigherBetter: true,
        });
      });
    }

    return baseMetrics;
  }, [report]);

  const allData = useMemo(() => generateMetricsData(), [generateMetricsData]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return allData;

    return [...allData].sort((a, b) => {
      if (a.value < b.value) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a.value > b.value) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allData, sortConfig]);

  // Filtering
  const filteredData = useMemo(() => {
    return sortedData.filter((item) => {
      if (filters.category && item.category !== filters.category) return false;
      if (filters.search && !item.metric.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [sortedData, filters]);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const formatValue = (value, format) => {
    if (typeof value !== 'number') return 'N/A';
    switch (format) {
      case 'currency': return `$${value.toFixed(2)}`;
      case 'percentage': return `${value.toFixed(2)}%`;
      case 'ratio': return value.toFixed(2);
      default: return value.toFixed(0);
    }
  };

  const getValueColor = (value, threshold, isHigherBetter) => {
    if (isHigherBetter) {
      return value >= threshold ? 'text-success' : 'text-error';
    } else {
      return value <= threshold ? 'text-success' : 'text-error';
    }
  };

  const exportToCSV = () => {
    const headers = ['Category', 'Metric', 'Value', 'Format', 'Threshold', 'Higher Better'];
    const rows = filteredData.map(item => [
      item.category,
      item.metric,
      item.value,
      item.format,
      item.threshold,
      item.isHigherBetter,
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${run.strategy}_metrics.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-base-200 border border-base-300 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <FunnelIcon className="w-4 h-4 text-base-content/50" />
            <select
              value={filters.category || 'all'}
              onChange={(e) => setFilters({ ...filters, category: e.target.value === 'all' ? undefined : e.target.value })}
              className="select select-bordered select-sm"
            >
              <option value="all">All Categories</option>
              <option value="Performance">Performance</option>
              <option value="Risk">Risk</option>
              <option value="Trading">Trading</option>
              <option value="Monte Carlo">Monte Carlo</option>
              <option value="Per-Pair">Per-Pair</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Search metrics..."
            value={filters.search || ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="input input-bordered input-sm flex-1 min-w-[200px]"
          />

          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="select select-bordered select-sm"
          >
            <option value={10}>10 rows</option>
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>

          <button
            onClick={exportToCSV}
            className="btn btn-sm btn-primary"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-base-200 border border-base-300 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-base-300">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    Category
                    {sortConfig.key === 'category' && (
                      sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    onClick={() => handleSort('metric')}
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    Metric
                    {sortConfig.key === 'metric' && (
                      sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleSort('value')}
                    className="flex items-center gap-1 hover:text-primary ml-auto"
                  >
                    Value
                    {sortConfig.key === 'value' && (
                      sortConfig.direction === 'asc' ? <ArrowUpIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-right">Threshold</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300">
              {paginatedData.map((item, idx) => (
                <tr key={idx} className="hover:bg-base-300 transition">
                  <td className="px-4 py-3 text-base-content/70">{item.category}</td>
                  <td className="px-4 py-3 font-medium text-base-content">{item.metric}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${getValueColor(item.value, item.threshold, item.isHigherBetter)}`}>
                    {formatValue(item.value, item.format)}
                  </td>
                  <td className="px-4 py-3 text-right text-base-content/70">
                    {item.threshold > 0 ? formatValue(item.threshold, item.format) : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      getValueColor(item.value, item.threshold, item.isHigherBetter) === 'text-success'
                        ? 'bg-success/20 text-success'
                        : 'bg-error/20 text-error'
                    }`}>
                      {getValueColor(item.value, item.threshold, item.isHigherBetter) === 'text-success' ? '✓' : '✗'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-base-300 px-4 py-3 flex items-center justify-between border-t border-base-300">
          <div className="text-sm text-base-content/70">
            Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredData.length)} of {filteredData.length} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="btn btn-sm btn-ghost disabled:opacity-50"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="btn btn-sm btn-ghost disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-base-content/70">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="btn btn-sm btn-ghost disabled:opacity-50"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="btn btn-sm btn-ghost disabled:opacity-50"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataTableTab;
