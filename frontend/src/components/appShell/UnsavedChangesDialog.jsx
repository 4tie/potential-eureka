export default function UnsavedChangesDialog({ onCancel, onConfirm }) {
  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="font-bold text-lg mb-1">&#9888;&#65039; Unsaved Changes!</h3>
        <p className="text-sm text-base-content/70">
          You have unsaved modifications in your strategy code. Are you sure you want to
          leave without saving?
        </p>
        <div className="modal-action mt-4">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-error btn-sm" onClick={onConfirm}>Leave Anyway</button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/40" onClick={onCancel} />
    </dialog>
  );
}
