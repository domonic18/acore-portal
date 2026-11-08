"use client";

/**
 * 表单字段外壳(label + 必填星号 + 控件 + 提示 + 内联错误):
 * label 采用「包裹式」关联(label 内直接放控件),Playwright 的 getByLabel 可命中;
 * 错误文案放在 label 外,避免污染控件的可访问名。
 */
export function FormField({
  label,
  required = false,
  hint,
  error,
  className = "",
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-[#93b2ce]">
          {label}
          {required && <span className="text-[#eda9a9]"> *</span>}
        </span>
        {children}
      </label>
      {hint && !error && <span className="text-xs text-[#6482a3]">{hint}</span>}
      {error && (
        <span role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </span>
      )}
    </div>
  );
}

/** 两列布局行(窄屏自动折行) */
export function FormRow({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className}`}>{children}</div>;
}

/** 分组小节标题(表单分区内的次级标题) */
export function FieldGroupTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-[12px] font-semibold tracking-wide text-[#6482a3] ${className}`}>
      {children}
    </h3>
  );
}
