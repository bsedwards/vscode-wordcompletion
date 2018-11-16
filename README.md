# wordcomplete README

Word completions similar to Eclipse.

## Features

Provides word completions in a predictable order, similar to Eclipse, by pressing "alt+/".

The process for finding matching words will start at the current position of the open document and move backwards to the beginning of the document. Next, it will start 
at the current position and move forwards to the end of the document. Finally, it will search the text from any other open documents, top to bottom.

Text from open documents will only be searched if the documents have been opened or switched to after the extension loads, due to limitations
in the API.

#\!\[feature X\]\(images/feature-x.png\)

#> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

None.

## Extension Settings

None at this time.

## Known Issues

Documents that are open when the extension is started will not have their text searched until they are switched to.

## Release Notes

Users appreciate release notes as you update your extension.

### 0.1.0

Initial release of WordCompletion