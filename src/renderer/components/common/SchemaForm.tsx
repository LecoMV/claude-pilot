/**
 * Schema-Driven Form Generator
 *
 * Generates forms from JSON Schema-like definitions.
 * Supports common field types with validation and help text.
 */

import { useState, useCallback, type ReactNode } from 'react'
import { Eye, EyeOff, Plus, Trash2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FormField as BaseFormField } from './HelpTooltip'
import { AdvancedSection } from './AdvancedSection'

// ============================================================================
// Types
// ============================================================================

export type SchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'password'
  | 'textarea'
  | 'json'
  | 'array'
  | 'object'
  | 'color'
  | 'file'
  | 'date'
  | 'time'
  | 'datetime'

export interface SchemaFieldOption {
  value: string | number
  label: string
  description?: string
  disabled?: boolean
}

export interface SchemaField {
  /** Unique field key */
  key: string
  /** Display label */
  label: string
  /** Field type */
  type: SchemaFieldType
  /** Help text shown via tooltip */
  help?: string
  /** Longer description below field */
  description?: string
  /** Placeholder text */
  placeholder?: string
  /** Default value */
  default?: unknown
  /** Whether field is required */
  required?: boolean
  /** Whether field is disabled */
  disabled?: boolean
  /** Whether field is read-only */
  readOnly?: boolean
  /** Visibility condition - field key that must be truthy */
  showIf?: string
  /** For select/multiselect */
  options?: SchemaFieldOption[]
  /** For number: min value */
  min?: number
  /** For number: max value */
  max?: number
  /** For number: step */
  step?: number
  /** For string: min length */
  minLength?: number
  /** For string: max length */
  maxLength?: number
  /** For string: regex pattern */
  pattern?: string
  /** For array: item schema */
  items?: Omit<SchemaField, 'key'>
  /** For object: nested fields */
  fields?: SchemaField[]
  /** For textarea: rows */
  rows?: number
  /** Whether this is an "advanced" field */
  advanced?: boolean
  /** Custom validation function */
  validate?: (value: unknown, values: Record<string, unknown>) => string | undefined
}

export interface SchemaFormProps {
  /** Form schema definition */
  schema: SchemaField[]
  /** Current form values */
  values: Record<string, unknown>
  /** Called when values change */
  onChange: (values: Record<string, unknown>) => void
  /** Called on form submission */
  onSubmit?: () => void
  /** Validation errors */
  errors?: Record<string, string>
  /** Whether form is submitting */
  isSubmitting?: boolean
  /** Whether to show advanced fields by default */
  showAdvanced?: boolean
  /** Title for advanced section */
  advancedTitle?: string
  /** Additional class names */
  className?: string
  /** Render custom footer */
  footer?: ReactNode
}

// ============================================================================
// Main Component
// ============================================================================

export function SchemaForm({
  schema,
  values,
  onChange,
  onSubmit,
  errors = {},
  isSubmitting = false,
  showAdvanced = false,
  advancedTitle = 'Advanced Options',
  className,
  footer,
}: SchemaFormProps) {
  const [localShowAdvanced, setLocalShowAdvanced] = useState(showAdvanced)

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...values, [key]: value })
    },
    [values, onChange]
  )

  // Split fields into basic and advanced
  const basicFields = schema.filter((f) => !f.advanced)
  const advancedFields = schema.filter((f) => f.advanced)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit?.()
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {/* Basic fields */}
      <div className="space-y-4">
        {basicFields.map((field) => (
          <SchemaFieldRenderer
            key={field.key}
            field={field}
            value={values[field.key]}
            values={values}
            error={errors[field.key]}
            onChange={(value) => handleFieldChange(field.key, value)}
            disabled={isSubmitting}
          />
        ))}
      </div>

      {/* Advanced fields */}
      {advancedFields.length > 0 && (
        <AdvancedSection
          title={advancedTitle}
          defaultOpen={localShowAdvanced}
          onToggle={setLocalShowAdvanced}
        >
          <div className="space-y-4">
            {advancedFields.map((field) => (
              <SchemaFieldRenderer
                key={field.key}
                field={field}
                value={values[field.key]}
                values={values}
                error={errors[field.key]}
                onChange={(value) => handleFieldChange(field.key, value)}
                disabled={isSubmitting}
              />
            ))}
          </div>
        </AdvancedSection>
      )}

      {/* Footer */}
      {footer}
    </form>
  )
}

// ============================================================================
// Field Renderer
// ============================================================================

interface SchemaFieldRendererProps {
  field: SchemaField
  value: unknown
  values: Record<string, unknown>
  error?: string
  onChange: (value: unknown) => void
  disabled?: boolean
}

function SchemaFieldRenderer({
  field,
  value,
  values,
  error,
  onChange,
  disabled,
}: SchemaFieldRendererProps) {
  // Check visibility condition
  if (field.showIf && !values[field.showIf]) {
    return null
  }

  const isDisabled = disabled || field.disabled

  return (
    <BaseFormField
      label={field.label}
      htmlFor={field.key}
      help={field.help}
      required={field.required}
      error={error}
    >
      {field.description && (
        <p className="text-xs text-text-muted -mt-1 mb-2">{field.description}</p>
      )}
      <FieldInput
        field={field}
        value={value}
        values={values}
        onChange={onChange}
        disabled={isDisabled}
      />
    </BaseFormField>
  )
}

// ============================================================================
// Field Input Components
// ============================================================================

interface FieldInputProps {
  field: SchemaField
  value: unknown
  values: Record<string, unknown>
  onChange: (value: unknown) => void
  disabled?: boolean
}

function FieldInput({ field, value, values, onChange, disabled }: FieldInputProps) {
  switch (field.type) {
    case 'string':
      return (
        <StringInput
          id={field.key}
          value={(value as string) ?? field.default ?? ''}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={disabled}
          readOnly={field.readOnly}
          minLength={field.minLength}
          maxLength={field.maxLength}
          pattern={field.pattern}
        />
      )

    case 'password':
      return (
        <PasswordInput
          id={field.key}
          value={(value as string) ?? ''}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      )

    case 'number':
      return (
        <NumberInput
          id={field.key}
          value={(value as number) ?? field.default ?? undefined}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={disabled}
          min={field.min}
          max={field.max}
          step={field.step}
        />
      )

    case 'boolean':
      return (
        <BooleanInput
          id={field.key}
          checked={(value as boolean) ?? (field.default as boolean) ?? false}
          onChange={onChange}
          disabled={disabled}
        />
      )

    case 'select':
      return (
        <SelectInput
          id={field.key}
          value={(value as string | number) ?? field.default ?? ''}
          onChange={onChange}
          options={field.options || []}
          placeholder={field.placeholder}
          disabled={disabled}
        />
      )

    case 'multiselect':
      return (
        <MultiselectInput
          id={field.key}
          value={(value as (string | number)[]) ?? (field.default as (string | number)[]) ?? []}
          onChange={onChange}
          options={field.options || []}
          disabled={disabled}
        />
      )

    case 'textarea':
      return (
        <TextareaInput
          id={field.key}
          value={(value as string) ?? field.default ?? ''}
          onChange={onChange}
          placeholder={field.placeholder}
          disabled={disabled}
          rows={field.rows}
          maxLength={field.maxLength}
        />
      )

    case 'json':
      return (
        <JSONInput
          id={field.key}
          value={value ?? field.default ?? {}}
          onChange={onChange}
          disabled={disabled}
          rows={field.rows}
        />
      )

    case 'array':
      return (
        <ArrayInput
          id={field.key}
          value={(value as unknown[]) ?? (field.default as unknown[]) ?? []}
          onChange={onChange}
          itemSchema={field.items}
          disabled={disabled}
        />
      )

    case 'object':
      return (
        <ObjectInput
          id={field.key}
          value={
            (value as Record<string, unknown>) ?? (field.default as Record<string, unknown>) ?? {}
          }
          onChange={onChange}
          fields={field.fields || []}
          values={values}
          disabled={disabled}
        />
      )

    case 'color':
      return (
        <ColorInput
          id={field.key}
          value={(value as string) ?? field.default ?? '#000000'}
          onChange={onChange}
          disabled={disabled}
        />
      )

    case 'date':
    case 'time':
    case 'datetime':
      return (
        <DateTimeInput
          id={field.key}
          type={field.type}
          value={(value as string) ?? ''}
          onChange={onChange}
          disabled={disabled}
        />
      )

    default:
      return <div className="text-text-muted text-sm">Unsupported field type: {field.type}</div>
  }
}

// ============================================================================
// Individual Input Components
// ============================================================================

interface StringInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  minLength?: number
  maxLength?: number
  pattern?: string
}

function StringInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  minLength,
  maxLength,
  pattern,
}: StringInputProps) {
  return (
    <input
      type="text"
      id={id}
      name={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      minLength={minLength}
      maxLength={maxLength}
      pattern={pattern}
      className="input"
    />
  )
}

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

function PasswordInput({ id, value, onChange, placeholder, disabled }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="input pr-10"
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
        tabIndex={-1}
      >
        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

interface NumberInputProps {
  id: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  placeholder?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
}

function NumberInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  min,
  max,
  step,
}: NumberInputProps) {
  return (
    <input
      type="number"
      id={id}
      name={id}
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value
        onChange(val === '' ? undefined : parseFloat(val))
      }}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      className="input"
    />
  )
}

interface BooleanInputProps {
  id: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

function BooleanInput({ id, checked, onChange, disabled }: BooleanInputProps) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          id={id}
          name={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div
          className={cn(
            'w-11 h-6 rounded-full transition-colors',
            'bg-surface-hover peer-checked:bg-accent-purple',
            'peer-focus:ring-2 peer-focus:ring-accent-purple/50',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        <div
          className={cn(
            'absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform',
            'peer-checked:translate-x-5'
          )}
        />
      </div>
      <span className="text-sm text-text-muted">{checked ? 'Enabled' : 'Disabled'}</span>
    </label>
  )
}

interface SelectInputProps {
  id: string
  value: string | number
  onChange: (value: string | number) => void
  options: SchemaFieldOption[]
  placeholder?: string
  disabled?: boolean
}

function SelectInput({ id, value, onChange, options, placeholder, disabled }: SelectInputProps) {
  return (
    <select
      id={id}
      name={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="input"
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

interface MultiselectInputProps {
  id: string
  value: (string | number)[]
  onChange: (value: (string | number)[]) => void
  options: SchemaFieldOption[]
  disabled?: boolean
}

function MultiselectInput({ id: _id, value, onChange, options, disabled }: MultiselectInputProps) {
  const toggleOption = (optValue: string | number) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue))
    } else {
      onChange([...value, optValue])
    }
  }

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={cn(
            'flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors',
            value.includes(opt.value)
              ? 'border-accent-purple bg-accent-purple/5'
              : 'border-border hover:border-border-hover',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => toggleOption(opt.value)}
            disabled={disabled || opt.disabled}
            className="sr-only"
          />
          <div
            className={cn(
              'w-4 h-4 rounded border-2 flex items-center justify-center',
              value.includes(opt.value) ? 'border-accent-purple bg-accent-purple' : 'border-border'
            )}
          >
            {value.includes(opt.value) && (
              <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-text-primary">{opt.label}</div>
            {opt.description && <div className="text-xs text-text-muted">{opt.description}</div>}
          </div>
        </label>
      ))}
    </div>
  )
}

interface TextareaInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  rows?: number
  maxLength?: number
}

function TextareaInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  rows = 4,
  maxLength,
}: TextareaInputProps) {
  return (
    <div className="relative">
      <textarea
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        maxLength={maxLength}
        className="input resize-y min-h-[100px]"
      />
      {maxLength && (
        <div className="absolute bottom-2 right-2 text-xs text-text-muted">
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  )
}

interface JSONInputProps {
  id: string
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
  rows?: number
}

function JSONInput({ id, value, onChange, disabled, rows = 6 }: JSONInputProps) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2))
  const [error, setError] = useState<string | null>(null)

  const handleChange = (newText: string) => {
    setText(newText)
    try {
      const parsed = JSON.parse(newText)
      onChange(parsed)
      setError(null)
    } catch {
      setError('Invalid JSON')
    }
  }

  return (
    <div className="space-y-1">
      <textarea
        id={id}
        name={id}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        className={cn(
          'input font-mono text-sm resize-y min-h-[100px]',
          error && 'border-accent-red'
        )}
      />
      {error && (
        <p className="text-xs text-accent-red flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {error}
        </p>
      )}
    </div>
  )
}

interface ArrayInputProps {
  id: string
  value: unknown[]
  onChange: (value: unknown[]) => void
  itemSchema?: Omit<SchemaField, 'key'>
  disabled?: boolean
}

function ArrayInput({ id, value, onChange, itemSchema, disabled }: ArrayInputProps) {
  const addItem = () => {
    const defaultValue = itemSchema?.default ?? (itemSchema?.type === 'object' ? {} : '')
    onChange([...value, defaultValue])
  }

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, newValue: unknown) => {
    const newArray = [...value]
    newArray[index] = newValue
    onChange(newArray)
  }

  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={index} className="flex items-start gap-2">
          <div className="flex-1">
            {itemSchema ? (
              <FieldInput
                field={{ ...itemSchema, key: `${id}[${index}]` } as SchemaField}
                value={item}
                values={{}}
                onChange={(v) => updateItem(index, v)}
                disabled={disabled}
              />
            ) : (
              <input
                type="text"
                value={String(item)}
                onChange={(e) => updateItem(index, e.target.value)}
                disabled={disabled}
                className="input"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => removeItem(index)}
            disabled={disabled}
            className="p-2 text-text-muted hover:text-accent-red transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        disabled={disabled}
        className="btn btn-secondary btn-sm"
      >
        <Plus className="w-4 h-4 mr-1" />
        Add Item
      </button>
    </div>
  )
}

interface ObjectInputProps {
  id: string
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  fields: SchemaField[]
  values: Record<string, unknown>
  disabled?: boolean
}

function ObjectInput({ id: _id, value, onChange, fields, values, disabled }: ObjectInputProps) {
  const handleFieldChange = (key: string, fieldValue: unknown) => {
    onChange({ ...value, [key]: fieldValue })
  }

  return (
    <div className="pl-4 border-l-2 border-border space-y-4">
      {fields.map((field) => (
        <SchemaFieldRenderer
          key={field.key}
          field={field}
          value={value[field.key]}
          values={{ ...values, ...value }}
          onChange={(v) => handleFieldChange(field.key, v)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

interface ColorInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

function ColorInput({ id, value, onChange, disabled }: ColorInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-10 h-10 rounded border border-border cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="input flex-1"
        pattern="^#[0-9A-Fa-f]{6}$"
      />
    </div>
  )
}

interface DateTimeInputProps {
  id: string
  type: 'date' | 'time' | 'datetime'
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

function DateTimeInput({ id, type, value, onChange, disabled }: DateTimeInputProps) {
  const inputType = type === 'datetime' ? 'datetime-local' : type

  return (
    <input
      type={inputType}
      id={id}
      name={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="input"
    />
  )
}

// ============================================================================
// Validation Helper
// ============================================================================

export function validateSchemaForm(
  schema: SchemaField[],
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of schema) {
    const value = values[field.key]

    // Skip hidden fields
    if (field.showIf && !values[field.showIf]) {
      continue
    }

    // Required validation
    if (field.required && (value === undefined || value === null || value === '')) {
      errors[field.key] = `${field.label} is required`
      continue
    }

    // Skip further validation if empty and not required
    if (value === undefined || value === null || value === '') {
      continue
    }

    // Type-specific validation
    switch (field.type) {
      case 'string':
      case 'password':
      case 'textarea':
        if (typeof value === 'string') {
          if (field.minLength && value.length < field.minLength) {
            errors[field.key] = `Minimum ${field.minLength} characters required`
          }
          if (field.maxLength && value.length > field.maxLength) {
            errors[field.key] = `Maximum ${field.maxLength} characters allowed`
          }
          if (field.pattern && !new RegExp(field.pattern).test(value)) {
            errors[field.key] = 'Invalid format'
          }
        }
        break

      case 'number':
        if (typeof value === 'number') {
          if (field.min !== undefined && value < field.min) {
            errors[field.key] = `Minimum value is ${field.min}`
          }
          if (field.max !== undefined && value > field.max) {
            errors[field.key] = `Maximum value is ${field.max}`
          }
        }
        break

      default:
        // Other types don't have built-in validation
        break
    }

    // Custom validation
    if (field.validate) {
      const customError = field.validate(value, values)
      if (customError) {
        errors[field.key] = customError
      }
    }
  }

  return errors
}

// ============================================================================
// Helper to create schema from object
// ============================================================================

export function createSchemaFromObject(
  obj: Record<string, unknown>,
  options?: {
    labels?: Record<string, string>
    help?: Record<string, string>
    required?: string[]
  }
): SchemaField[] {
  return Object.entries(obj).map(([key, value]) => {
    let type: SchemaFieldType = 'string'
    if (typeof value === 'number') type = 'number'
    if (typeof value === 'boolean') type = 'boolean'
    if (Array.isArray(value)) type = 'array'
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) type = 'json'

    return {
      key,
      label: options?.labels?.[key] ?? key,
      type,
      help: options?.help?.[key],
      required: options?.required?.includes(key),
      default: value,
    }
  })
}
