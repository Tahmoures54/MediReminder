import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * ترکیب کلاس‌های CSS با پشتیبانی از کلاس‌های شرطی و ادغام هوشمند Tailwind.
 *
 * @example
 * cn("px-2", isActive && "bg-blue-500", "py-1")
 * // => "px-2 py-1 bg-blue-500"
 *
 * @param inputs - آرایه‌ای از ClassValue که می‌تواند رشته، آبجکت، آرایه یا مقدار falsy باشد.
 * @returns رشته نهایی className
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
