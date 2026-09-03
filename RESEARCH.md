# מקורות מחקר והחלטות מוצר

המסמך מרכז מקורות רשמיים ששימשו לתכנון, כדי שהמשך העבודה לא יסתמך על זיכרון או הנחות. לפני שינוי אינטגרציה חיצונית יש לבדוק מחדש את התיעוד, משום שמדיניות וממשקים משתנים.

## לוח עברי

- [Hebcal Developer APIs](https://www.hebcal.com/home/developer-apis) — נקודת הכניסה הרשמית לכלי הפיתוח של Hebcal.
- [תיעוד `@hebcal/hdate`](https://hebcal.github.io/api/) — API לחישוב תאריכים, שנים מעוברות וימי הולדת/ימי שנה.

החלטה: להשתמש בספרייה ותיקה וממוקדת במקום לכתוב אלגוריתם לוח עברי עצמאי. עותק הדפדפן והרישיון נמצאים תחת `dist/vendor/hdate/`.

## Google Identity ו־Calendar

- [יצירת OAuth Client ID לאפליקציית Web](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
- [Google Identity Services — OAuth token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [בחירת הרשאות Google Calendar](https://developers.google.com/workspace/calendar/api/auth)
- [Brand verification ודרישות לפרודקשן](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

החלטות:

- להשתמש ב־token model בדפדפן ולא להטמיע Client Secret.
- לבקש את `calendar.app.created`, שמיועד ליומנים שנוצרו על ידי האפליקציה, במקום הרשאה רחבה לכל היומן ככל שהתרחיש מאפשר.
- ליצור יומן ייעודי כדי שהמשתמש יוכל לזהות, להסתיר או למחוק את כל הנתונים שהאפליקציה יצרה.
- לייצר IDs יציבים ולבצע upsert, כדי שסנכרון חוזר לא ייצור כפילויות.

## UX של תאריכים וטפסים

- [GOV.UK Design System — Date input](https://design-system.service.gov.uk/components/date-input/)
- [GOV.UK Design System — Validation pattern](https://design-system.service.gov.uk/patterns/validation/)

החלטות:

- לתת למשתמש לבחור במפורש אם הוא מזין לועזי או עברי.
- להציג preview של התאריך המחושב לפני השמירה.
- להצמיד הודעות שגיאה לטופס בשפה פשוטה ולהשאיר ערכים לתיקון.
- להסביר את משמעות "אחרי השקיעה", משום שהיום העברי מתחיל בערב הקודם.

## GitHub Pages

- [יצירת אתר GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

החלטה: לצרף workflow שמפרסם את `dist/` ללא build, כך שהפרויקט ניתן להעברה ל־GitHub בלי שינוי בארכיטקטורה.
