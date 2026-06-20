import { useState } from "react";
import { 
  DocumentArrowDownIcon, 
  ChevronDownIcon,
  ChartBarIcon,
  TableCellsIcon,
  DocumentTextIcon
} from "@heroicons/react/24/outline";

const ExportButton = ({ onExport }) => {
  const [showMenu, setShowMenu] = useState(false);

  const exportOptions = [
    { id: 'current-view', label: 'Current View (PNG)', icon: DocumentArrowDownIcon },
    { id: 'all-data', label: 'All Data (CSV)', icon: TableCellsIcon },
    { id: 'report', label: 'Full Report (HTML)', icon: DocumentTextIcon },
    { id: 'charts', label: 'Charts Only (PNG)', icon: ChartBarIcon },
  ];

  const handleExport = (format) => {
    onExport(format);
    setShowMenu(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="btn btn-sm btn-primary gap-2"
      >
        <DocumentArrowDownIcon className="w-4 h-4" />
        Export
        <ChevronDownIcon className="w-4 h-4" />
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 mt-2 w-56 bg-base-200 border border-base-300 rounded-lg shadow-xl z-50">
            <div className="p-2">
              {exportOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleExport(option.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-base-300 transition text-left"
                >
                  <option.icon className="w-4 h-4 text-base-content/70" />
                  <span className="text-sm">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ExportButton;
