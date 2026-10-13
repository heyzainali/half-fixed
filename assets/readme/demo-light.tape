# half-fixed demo (light theme): scan prism-php/prism for hf-5505660
# Records the scanner running against prism-php/prism@5d6cc65 where the bug appears.
# Requires: Node 18+, ttyd, ffmpeg
# Usage: vhs demo-light.tape (from a directory with /tmp/prism cloned)

Output demo-light.gif

Set FontFamily "JetBrains Mono,SF Mono,Menlo,monospace"
Set FontSize 14
Set Width 920
Set Height 540
Set Padding 16
Set TypingSpeed 50ms
Set Theme "Builtin Light"
Set WindowBar Colorful
Set WindowBarSize 40
Set CursorBlink false

Set Shell bash

Hide
Type "cd /tmp/prism"
Enter
Sleep 500ms
Show

Type "npx half-fixed scan --group ToolMap"
Sleep 400ms
Enter

Sleep 3500ms

Type "# hf-5505660: Groq, Mistral, xAI, Z still had the bug → fixed in #1038"
Sleep 300ms
Enter

Sleep 4s
