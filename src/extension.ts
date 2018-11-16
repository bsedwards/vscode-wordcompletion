'use strict';
import {window, commands, ExtensionContext, Position, StatusBarAlignment, StatusBarItem, TextDocument, TextDocumentChangeEvent, TextEditor, TextEditorEdit, Range, workspace} from 'vscode';
import * as lodash from 'lodash';

/**
 * Create the current work class and document list class.
 * Register listener to handle cycle word keypress.
 * Register listeners for when documents are opened, closed or changed (switched to) to suggest words for all open documents.
 */
export function activate(context: ExtensionContext) {
    let cword = new CurrentWord();
    let docList = new DocumentList();

    let disposable = commands.registerTextEditorCommand('wordcompletion.cycle', (textEditor: TextEditor, edit: TextEditorEdit) => {
        cword.updateCurrentWord(textEditor, edit, docList);
    });

    //in order to get text from documents other than the active one, register event listeners to store documents
    //when opened or changed, and remove documents when closed
    context.subscriptions.push(workspace.onDidOpenTextDocument((document: TextDocument) => {
        docList.set(document, document.getText());
    }));

    context.subscriptions.push(workspace.onDidCloseTextDocument((document: TextDocument) => {
        if(docList.has(document)) {
            docList.delete(document);
        }
    }));

    context.subscriptions.push(workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
        docList.set(e.document, e.document.getText());
    }));

    //I kind of don't like how this works.
    // loadActiveDocuments(docList);

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(cword);
    context.subscriptions.push(disposable);
}

/**
 * Get active documents on startup using the nextEditor command
 * Based on https://github.com/atishay/vscode-allautocomplete/blob/master/src/Utils.ts#L57
 * which is based on https://github.com/eamodio/vscode-restore-editors/blob/master/src/documentManager.ts#L57
 */
/*
function loadActiveDocuments(docList: DocumentList) {
    return new Promise((resolve, reject) => {
        let startEditor = window.activeTextEditor;
        let currentEditor = startEditor;
        function getNextEditor() {
            if(currentEditor) {
                if(!startEditor) {
                    startEditor = currentEditor;
                }
                docList.set(currentEditor.document, currentEditor.document.getText());
            }
            setTimeout(() => {
                currentEditor = window.activeTextEditor;
                ///we're done if we've gotten the same editor, or didn't get any editors to begin with
                let done = (currentEditor && docList.has(currentEditor.document)) ||
                            (startEditor && currentEditor && startEditor === currentEditor) ||
                            (!startEditor && !currentEditor);
                return done ? resolve() : getNextEditor();
            }, 200);
            commands.executeCommand('workbench.action.nextEditor');
        }
        getNextEditor();
    });
}
*/

/**
 * Could just declare variable as Map<TextDocument, string>, but might want some functionality here.
 */
class DocumentList extends Map<TextDocument, string> {

}

/**
 * Class to get current word and replace with a suggestion.
 */
class CurrentWord {
    private _statusBarItem: StatusBarItem =  window.createStatusBarItem(StatusBarAlignment.Left);
    //store the word at the current position when the command is sent
    private _activeWord: string = '';
    //store words that match _activeWord, in the order they'll be suggested.
    private _words: Array<string> = []; 
    //the current position and document, stored to detect if they've changed.
    //It's possible another document has been opened but the word at the current position is the same as the word
    //when the command was last activated, in which case I still want to reload the word list.
    private _pos: Position | undefined; 
    private _doc: TextDocument | undefined;

    /**
     * Get the current word, load suggestions if it's not the same word as the last time
     * the command was activated, cycle through suggestions.
     * @param editor 
     * @param editorEdit 
     * @param docList 
     */
    public updateCurrentWord(editor: TextEditor, editorEdit: TextEditorEdit, docList: DocumentList) {
        let doc = editor.document;
        let w = this.getCurrentWord(editor, doc);

        //if document, position or word has changed, load new suggestions
        if(this.positionHasChanged(w, doc, editor.selection.active)) {
            this._activeWord = w ? w : '';
            this._doc = doc;
            this._pos = editor.selection.active;
            this.updateStatusBar(w, editor.selection.active);
            this.loadWords(w, docList);
        }

        //enter suggestion
        let nextWord = this._words.shift();
        let activeRange = doc.getWordRangeAtPosition(editor.selection.active);
        if(activeRange && nextWord) {
            editorEdit.delete(activeRange);
            editorEdit.insert(activeRange.start, nextWord);
            this._words.push(nextWord); //put the word back at the end so it cycles around
        }
    }

    /**
     * Based on the current word (w), the current document and current position, has the position
     * or document changed? If so, we'll reload the word list. If not, we want to suggest the next word
     * in the word list.
     * @param w 
     * @param doc 
     * @param pos 
     */
    private positionHasChanged(w:string, doc: TextDocument, pos: Position): boolean {
        //if previous doc or position are undefined, or if doc has changed, or if active word is blank
        if(!this._doc || !this._pos || doc !== this._doc || this._activeWord.length === 0) {
            return true;
        }

        //this word should contain the active word, or the word has changed (even if the position has not)
        if(!w.startsWith(this._activeWord)) {
            return true;
        }

        //Check the the current word is in the list of words to suggest. If not, the user has started typing
        //more, and we need to refresh our suggestions.
        if(this._words.indexOf(w) === -1) {
            return true;
        }

        //Check if the current position "matches" the stored position. Position means end of the current / stored word,
        //so the current position - length of the current word + length of original word should match stored position.
        let char = pos.character - w.length + this._activeWord.length;
        let newPos = new Position(pos.line, char >= 0 ? char : 0);
        return newPos.line !== this._pos.line || newPos.character !== this._pos.character;
    }

    /**
     * Load words from open documents into an array, in the order they will be suggested:
     *  1. Start from current position and go backward through the open document to the start
     *  2. Start from current position and go forward to the end of the open document
     *  3. Go through open documents and search start to end
     * @param word  string  word to match
     * @param docList   DocumentList   list of open documents
     */
    private loadWords(word: string, docList: DocumentList) {
        //check that doc and pos are valid
        if(!this._doc || !this._pos) {
            return;
        }

        //empty matching words
        this._words = [];

        //find words starting at top and going to the current position, then reverse so closest is first
        let text = this._doc.getText(new Range(new Position(0, 0), this._pos));
        this.pushWordsFromText(word, text);
        this._words.reverse();

        //find words starting at current position
        let lastLine = this._doc.lineAt(this._doc.lineCount - 1);
        text = this._doc.getText(new Range(this._pos, new Position(this._doc.lineCount - 1, lastLine.range.end.character)));
        this.pushWordsFromText(word, text);

        //find words from other editors
        docList.forEach((docText: string) => {
            this.pushWordsFromText(word, docText);
        });

        //add this word at the back, so the suggestions end with it
        this._words.push(word);
        this._words = lodash.uniq(this._words);
    }

    /**
     * Get the current word in the given document
     * @param editor
     * @param doc 
     */
    private getCurrentWord(editor: TextEditor, doc: TextDocument): string {
        let activeRange = doc.getWordRangeAtPosition(editor.selection.active);
        let aword = doc.getText(activeRange);
        return aword;
    }

    /**
     * Update the status bar to show what word is being matched
     * @param word 
     * @param p 
     */
    private updateStatusBar(word: string, p: Position) {
        this._statusBarItem.text = `${word}`; // ${p.line} ${p.character}
        this._statusBarItem.show();
    }

    /**
     * Search the given text for the active word. Pushes onto this._word
     * @param word
     * @param text 
     */
    private pushWordsFromText(word: string, text: string) {
        //match (start of document OR whitespace OR non-word character)({word} followed by word character(s))
        let regexp = new RegExp("(^|\\s+|\\W)(" + word + "\\w+)", "gm");
        let match;
        while((match = regexp.exec(text)) !== null) {
            this._words.push(match[2].trim());
        }
        this._words = lodash.uniq(this._words);
    }

    dispose() {
        this._statusBarItem.dispose();
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}