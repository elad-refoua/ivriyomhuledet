/*! @hebcal/hdate v0.22.8, distributed under GPLv2 https://www.gnu.org/licenses/gpl-2.0.txt */
/* eslint-disable @typescript-eslint/no-namespace */
import { abs2greg, daysInGregMonth, greg2abs, isDate, isGregLeapYear, } from './greg.js';
/**
 * Gregorian date helper functions.
 *
 * These are aliases retained for backwards compatibility. Each member
 * simply forwards to the identically-behaving top-level function, which
 * is the preferred form in new code because it tree-shakes cleanly:
 *
 * | Namespace | Top-level equivalent |
 * | --- | --- |
 * | `greg.abs2greg` | {@link abs2greg} |
 * | `greg.daysInMonth` | {@link daysInGregMonth} |
 * | `greg.greg2abs` | {@link greg2abs} |
 * | `greg.isDate` | {@link isDate} |
 * | `greg.isLeapYear` | {@link isGregLeapYear} |
 * @example
 * import {greg} from '@hebcal/hdate';
 * greg.greg2abs(new Date(2008, 10, 13)); // 733359
 * greg.isLeapYear(2024);                 // true
 */
export var greg;
(function (greg) {
})(greg || (greg = {}));
greg.abs2greg = abs2greg;
greg.daysInMonth = daysInGregMonth;
greg.greg2abs = greg2abs;
greg.isDate = isDate;
greg.isLeapYear = isGregLeapYear;
//# sourceMappingURL=gregNamespace.js.map