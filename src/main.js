/**
 * Modern HTML Diff Library
 * Compares two HTML strings and returns a diff with <ins> and <del> tags
 */

class HTMLDiff {
    constructor() {
      this.operationMap = {
        equal: (op, beforeTokens, afterTokens) => 
          beforeTokens.slice(op.startInBefore, op.endInBefore + 1).join(''),
        
        insert: (op, beforeTokens, afterTokens) => {
          const value = afterTokens.slice(op.startInAfter, op.endInAfter + 1);
          return this.wrapWithTag('ins', value);
        },
        
        delete: (op, beforeTokens, afterTokens) => {
          const value = beforeTokens.slice(op.startInBefore, op.endInBefore + 1);
          return this.wrapWithTag('del', value);
        },
        
        replace: (op, beforeTokens, afterTokens) => 
          this.operationMap.insert(op, beforeTokens, afterTokens) +
          this.operationMap.delete(op, beforeTokens, afterTokens)
      };
    }
  
    /**
     * Main diff function - returns structured diff data
     * @param {string} before - Original HTML string
     * @param {string} after - New HTML string
     * @returns {Object[]} Array of diff objects with position and change info
     */
    diff(before, after) {
      if (before === after) {
        return [{
          type: 'equal',
          text: before,
          startPosition: 0,
          endPosition: before.length - 1,
          length: before.length
        }];
      }
  
      const beforeTokens = this.htmlToTokens(before);
      const afterTokens = this.htmlToTokens(after);
      const operations = this.calculateOperations(beforeTokens, afterTokens);
      
      return this.createDiffObjects(before, after, beforeTokens, afterTokens, operations);
    }
  
    /**
     * Legacy diff function - returns HTML markup (for backward compatibility)
     * @param {string} before - Original HTML string
     * @param {string} after - New HTML string
     * @returns {string} HTML with diff markup
     */
    diffToHTML(before, after) {
      if (before === after) return before;
  
      const beforeTokens = this.htmlToTokens(before);
      const afterTokens = this.htmlToTokens(after);
      const operations = this.calculateOperations(beforeTokens, afterTokens);
      
      return this.renderOperations(beforeTokens, afterTokens, operations);
    }
  
    /**
     * Tokenizes HTML string into meaningful chunks
     * @param {string} html - HTML string to tokenize
     * @returns {string[]} Array of tokens
     */
    htmlToTokens(html) {
      const tokens = [];
      let currentToken = '';
      let mode = 'char'; // 'char', 'tag', 'whitespace'
  
      for (const char of html) {
        switch (mode) {
          case 'tag':
            currentToken += char;
            if (this.isEndOfTag(char)) {
              tokens.push(currentToken);
              currentToken = '';
              mode = this.isWhitespace(char) ? 'whitespace' : 'char';
            }
            break;
  
          case 'char':
            if (this.isStartOfTag(char)) {
              if (currentToken) tokens.push(currentToken);
              currentToken = char;
              mode = 'tag';
            } else if (this.isWhitespace(char)) {
              if (currentToken) tokens.push(currentToken);
              currentToken = char;
              mode = 'whitespace';
            } else if (/[\w#@]/i.test(char)) {
              currentToken += char;
            } else {
              if (currentToken) tokens.push(currentToken);
              currentToken = char;
            }
            break;
  
          case 'whitespace':
            if (this.isStartOfTag(char)) {
              if (currentToken) tokens.push(currentToken);
              currentToken = char;
              mode = 'tag';
            } else if (this.isWhitespace(char)) {
              currentToken += char;
            } else {
              if (currentToken) tokens.push(currentToken);
              currentToken = char;
              mode = 'char';
            }
            break;
        }
      }
  
      if (currentToken) tokens.push(currentToken);
      return tokens;
    }
  
    /**
     * Calculate diff operations between token arrays
     * @param {string[]} beforeTokens 
     * @param {string[]} afterTokens 
     * @returns {Object[]} Array of operations
     */
    calculateOperations(beforeTokens, afterTokens) {
      if (!beforeTokens) throw new Error('beforeTokens is required');
      if (!afterTokens) throw new Error('afterTokens is required');
  
      let positionInBefore = 0;
      let positionInAfter = 0;
      const operations = [];
      
      const actionMap = {
        'false,false': 'replace',
        'true,false': 'insert',
        'false,true': 'delete',
        'true,true': 'none'
      };
  
      const matches = this.findMatchingBlocks(beforeTokens, afterTokens);
      matches.push(new Match(beforeTokens.length, afterTokens.length, 0));
  
      for (const match of matches) {
        const matchStartsAtCurrentPositionInBefore = positionInBefore === match.startInBefore;
        const matchStartsAtCurrentPositionInAfter = positionInAfter === match.startInAfter;
        
        const action = actionMap[`${matchStartsAtCurrentPositionInBefore},${matchStartsAtCurrentPositionInAfter}`];
  
        if (action !== 'none') {
          operations.push({
            action,
            startInBefore: positionInBefore,
            endInBefore: action !== 'insert' ? match.startInBefore - 1 : undefined,
            startInAfter: positionInAfter,
            endInAfter: action !== 'delete' ? match.startInAfter - 1 : undefined
          });
        }
  
        if (match.length !== 0) {
          operations.push({
            action: 'equal',
            startInBefore: match.startInBefore,
            endInBefore: match.endInBefore,
            startInAfter: match.startInAfter,
            endInAfter: match.endInAfter
          });
        }
  
        positionInBefore = match.endInBefore + 1;
        positionInAfter = match.endInAfter + 1;
      }
  
      return this.postProcessOperations(operations, beforeTokens);
    }
  
    /**
     * Post-process operations to merge adjacent operations
     * @param {Object[]} operations 
     * @param {string[]} beforeTokens 
     * @returns {Object[]} Processed operations
     */
    postProcessOperations(operations, beforeTokens) {
      const processed = [];
      let lastOp = { action: 'none' };
  
      const isSingleWhitespace = (op) => {
        if (op.action !== 'equal') return false;
        if (op.endInBefore - op.startInBefore !== 0) return false;
        const token = beforeTokens.slice(op.startInBefore, op.endInBefore + 1).join('');
        return /^\s$/.test(token);
      };
  
      for (const op of operations) {
        if ((isSingleWhitespace(op) && lastOp.action === 'replace') ||
            (op.action === 'replace' && lastOp.action === 'replace')) {
          lastOp.endInBefore = op.endInBefore;
          lastOp.endInAfter = op.endInAfter;
        } else {
          processed.push(op);
          lastOp = op;
        }
      }
  
      return processed;
    }
  
    /**
     * Find matching blocks between two token arrays
     * @param {string[]} beforeTokens 
     * @param {string[]} afterTokens 
     * @returns {Match[]} Array of matches
     */
    findMatchingBlocks(beforeTokens, afterTokens) {
      const matchingBlocks = [];
      const index = this.createIndex(beforeTokens, afterTokens);
      
      return this.recursivelyFindMatchingBlocks(
        beforeTokens, afterTokens, index, 
        0, beforeTokens.length, 0, afterTokens.length, matchingBlocks
      );
    }
  
    /**
     * Recursively find matching blocks
     * @param {string[]} beforeTokens 
     * @param {string[]} afterTokens 
     * @param {Object} index 
     * @param {number} startInBefore 
     * @param {number} endInBefore 
     * @param {number} startInAfter 
     * @param {number} endInAfter 
     * @param {Match[]} matchingBlocks 
     * @returns {Match[]} Updated matching blocks
     */
    recursivelyFindMatchingBlocks(beforeTokens, afterTokens, index, 
                                 startInBefore, endInBefore, startInAfter, endInAfter, matchingBlocks) {
      const match = this.findMatch(beforeTokens, afterTokens, index, 
                                  startInBefore, endInBefore, startInAfter, endInAfter);
  
      if (match) {
        if (startInBefore < match.startInBefore && startInAfter < match.startInAfter) {
          this.recursivelyFindMatchingBlocks(beforeTokens, afterTokens, index,
                                            startInBefore, match.startInBefore, 
                                            startInAfter, match.startInAfter, matchingBlocks);
        }
  
        matchingBlocks.push(match);
  
        if (match.endInBefore < endInBefore && match.endInAfter < endInAfter) {
          this.recursivelyFindMatchingBlocks(beforeTokens, afterTokens, index,
                                            match.endInBefore + 1, endInBefore,
                                            match.endInAfter + 1, endInAfter, matchingBlocks);
        }
      }
  
      return matchingBlocks;
    }
  
    /**
     * Find the best match in a given range
     * @param {string[]} beforeTokens 
     * @param {string[]} afterTokens 
     * @param {Object} index 
     * @param {number} startInBefore 
     * @param {number} endInBefore 
     * @param {number} startInAfter 
     * @param {number} endInAfter 
     * @returns {Match|null} Best match found
     */
    findMatch(beforeTokens, afterTokens, index, startInBefore, endInBefore, startInAfter, endInAfter) {
      let bestMatchInBefore = startInBefore;
      let bestMatchInAfter = startInAfter;
      let bestMatchLength = 0;
      let matchLengthAt = {};
  
      for (let indexInBefore = startInBefore; indexInBefore < endInBefore; indexInBefore++) {
        const newMatchLengthAt = {};
        const lookingFor = beforeTokens[indexInBefore];
        const locationsInAfter = index[lookingFor] || [];
  
        for (const indexInAfter of locationsInAfter) {
          if (indexInAfter < startInAfter) continue;
          if (indexInAfter >= endInAfter) break;
  
          const previousMatchLength = matchLengthAt[indexInAfter - 1] || 0;
          const newMatchLength = previousMatchLength + 1;
          newMatchLengthAt[indexInAfter] = newMatchLength;
  
          if (newMatchLength > bestMatchLength) {
            bestMatchInBefore = indexInBefore - newMatchLength + 1;
            bestMatchInAfter = indexInAfter - newMatchLength + 1;
            bestMatchLength = newMatchLength;
          }
        }
  
        matchLengthAt = newMatchLengthAt;
      }
  
      return bestMatchLength !== 0 
        ? new Match(bestMatchInBefore, bestMatchInAfter, bestMatchLength)
        : null;
    }
  
    /**
     * Create an index of token positions
     * @param {string[]} findThese 
     * @param {string[]} inThese 
     * @returns {Object} Index mapping tokens to positions
     */
    createIndex(findThese, inThese) {
      const index = {};
  
      for (const token of findThese) {
        index[token] = [];
        let idx = inThese.indexOf(token);
        while (idx !== -1) {
          index[token].push(idx);
          idx = inThese.indexOf(token, idx + 1);
        }
      }
  
      return index;
    }
  
    /**
     * Create structured diff objects with position information
     * @param {string} before - Original text
     * @param {string} after - New text  
     * @param {string[]} beforeTokens - Tokenized before text
     * @param {string[]} afterTokens - Tokenized after text
     * @param {Object[]} operations - Calculated operations
     * @returns {Object[]} Array of diff objects
     */
    createDiffObjects(before, after, beforeTokens, afterTokens, operations) {
      const diffObjects = [];
  
      for (const op of operations) {
        switch (op.action) {
          case 'equal':
            const equalText = beforeTokens.slice(op.startInBefore, op.endInBefore + 1).join('');
            const beforeStart = this.getTextPosition(beforeTokens, 0, op.startInBefore);
            const afterStart = this.getTextPosition(afterTokens, 0, op.startInAfter);
            
            diffObjects.push({
              type: 'equal',
              text: equalText,
              beforeStartPosition: beforeStart,
              beforeEndPosition: beforeStart + equalText.length - 1,
              afterStartPosition: afterStart,
              afterEndPosition: afterStart + equalText.length - 1,
              length: equalText.length
            });
            break;
  
          case 'insert':
            const insertedText = afterTokens.slice(op.startInAfter, op.endInAfter + 1).join('');
            const insertAfterStart = this.getTextPosition(afterTokens, 0, op.startInAfter);
            
            diffObjects.push({
              type: 'insert',
              text: insertedText,
              afterStartPosition: insertAfterStart,
              afterEndPosition: insertAfterStart + insertedText.length - 1,
              length: insertedText.length,
              beforePosition: this.getTextPosition(beforeTokens, 0, op.startInBefore || beforeTokens.length)
            });
            break;
  
          case 'delete':
            const deletedText = beforeTokens.slice(op.startInBefore, op.endInBefore + 1).join('');
            const deleteBeforeStart = this.getTextPosition(beforeTokens, 0, op.startInBefore);
            
            diffObjects.push({
              type: 'delete',
              text: deletedText,
              beforeStartPosition: deleteBeforeStart,
              beforeEndPosition: deleteBeforeStart + deletedText.length - 1,
              length: deletedText.length,
              afterPosition: this.getTextPosition(afterTokens, 0, op.startInAfter || afterTokens.length)
            });
            break;
  
          case 'replace':
            const deletedTextReplace = beforeTokens.slice(op.startInBefore, op.endInBefore + 1).join('');
            const insertedTextReplace = afterTokens.slice(op.startInAfter, op.endInAfter + 1).join('');
            const replaceBeforeStart = this.getTextPosition(beforeTokens, 0, op.startInBefore);
            const replaceAfterStart = this.getTextPosition(afterTokens, 0, op.startInAfter);
            
            diffObjects.push({
              type: 'replace',
              oldText: deletedTextReplace,
              newText: insertedTextReplace,
              beforeStartPosition: replaceBeforeStart,
              beforeEndPosition: replaceBeforeStart + deletedTextReplace.length - 1,
              afterStartPosition: replaceAfterStart,
              afterEndPosition: replaceAfterStart + insertedTextReplace.length - 1,
              oldLength: deletedTextReplace.length,
              newLength: insertedTextReplace.length
            });
            break;
        }
      }
  
      return diffObjects;
    }
  
    /**
     * Get the character position in the original text from token indices
     * @param {string[]} tokens - Token array
     * @param {number} startToken - Starting token index
     * @param {number} endToken - Ending token index
     * @returns {number} Character position in original text
     */
    getTextPosition(tokens, startToken, endToken) {
      return tokens.slice(startToken, endToken).join('').length;
    }
  
    /**
     * Wrap content with HTML tag, preserving existing tags
     * @param {string} tag 
     * @param {string[]} content 
     * @returns {string} Wrapped content
     */
    wrapWithTag(tag, content) {
      let rendering = '';
      let position = 0;
      const length = content.length;
  
      while (position < length) {
        // Process non-tag tokens
        const nonTags = this.consecutiveWhere(position, content, token => !this.isTag(token));
        position += nonTags.length;
  
        if (nonTags.length > 0) {
          rendering += `<${tag}>${nonTags.join('')}</${tag}>`;
        }
  
        if (position >= length) break;
  
        // Process tag tokens
        const tags = this.consecutiveWhere(position, content, token => this.isTag(token));
        position += tags.length;
        rendering += tags.join('');
      }
  
      return rendering;
    }
  
    /**
     * Get consecutive tokens that match a predicate
     * @param {number} start 
     * @param {string[]} content 
     * @param {Function} predicate 
     * @returns {string[]} Consecutive matching tokens
     */
    consecutiveWhere(start, content, predicate) {
      const subset = content.slice(start);
      let lastMatchingIndex = -1;
  
      for (let i = 0; i < subset.length; i++) {
        const result = predicate(subset[i]);
        if (result === true) {
          lastMatchingIndex = i;
        } else if (result === false) {
          break;
        }
      }
  
      return lastMatchingIndex >= 0 ? subset.slice(0, lastMatchingIndex + 1) : [];
    }
  
    // Helper methods
    isEndOfTag(char) {
      return char === '>';
    }
  
    isStartOfTag(char) {
      return char === '<';
    }
  
    isWhitespace(char) {
      return /^\s+$/.test(char);
    }
  
    isTag(token) {
      return /^\s*<[^>]+>\s*$/.test(token);
    }
  }
  
  /**
   * Match class representing a matching block between two sequences
   */
  class Match {
    constructor(startInBefore, startInAfter, length) {
      this.startInBefore = startInBefore;
      this.startInAfter = startInAfter;
      this.length = length;
      this.endInBefore = this.startInBefore + this.length - 1;
      this.endInAfter = this.startInAfter + this.length - 1;
    }
  }
  
  // Create global instance and export function
  const htmlDiffer = new HTMLDiff();
  
  /**
   * Compare two HTML strings and return structured diff data
   * @param {string} before - Original HTML
   * @param {string} after - New HTML
   * @returns {Object[]} Array of diff objects with position info
   */
  function htmldiff(before, after) {
    return htmlDiffer.diff(before, after);
  }
  
  /**
   * Compare two HTML strings and return HTML markup (legacy)
   * @param {string} before - Original HTML
   * @param {string} after - New HTML  
   * @returns {string} HTML with diff markup
   */
  function htmldiffToHTML(before, after) {
    return htmlDiffer.diffToHTML(before, after);
  }
  
  // Export for different module systems
  if (typeof define === 'function' && define.amd) {
    define([], () => ({ htmldiff, htmldiffToHTML, HTMLDiff }));
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = htmldiff;
    module.exports.htmldiff = htmldiff;
    module.exports.htmldiffToHTML = htmldiffToHTML;
    module.exports.HTMLDiff = HTMLDiff;
    module.exports.Match = Match;
  } else if (typeof window !== 'undefined') {
    window.htmldiff = htmldiff;
    window.htmldiffToHTML = htmldiffToHTML;
    window.HTMLDiff = HTMLDiff;
  }
  
  // Usage example
  if (typeof document !== 'undefined') {
    const originalHTML = 'this is original text';
    const newHTML = 'this is new text';
  
    // Generate structured diff data
    const diffData = htmldiff(originalHTML, newHTML);
    console.log('Diff data:', diffData);
  
    // Generate HTML markup (legacy method)
    const forwardDiff = htmldiffToHTML(originalHTML, newHTML);
    const reverseDiff = htmldiffToHTML(newHTML, originalHTML);
  
    // Display results if elements exist
    const outputElement = document.getElementById('output');
    const outputNewElement = document.getElementById('outputNew');
    
    if (outputElement) outputElement.innerHTML = forwardDiff;
    if (outputNewElement) outputNewElement.innerHTML = reverseDiff;
  
    // Example of how to use diff data for custom highlighting
    function highlightDifferences(diffData, targetElement) {
      if (!targetElement) return;
      
      let html = '';
      diffData.forEach(diff => {
        switch (diff.type) {
          case 'equal':
            html += diff.text;
            break;
          case 'insert':
            html += `<span class="inserted" data-position="${diff.afterStartPosition}">${diff.text}</span>`;
            break;
          case 'delete':
            html += `<span class="deleted" data-position="${diff.beforeStartPosition}">${diff.text}</span>`;
            break;
          case 'replace':
            html += `<span class="deleted" data-position="${diff.beforeStartPosition}">${diff.oldText}</span>`;
            html += `<span class="inserted" data-position="${diff.afterStartPosition}">${diff.newText}</span>`;
            break;
        }
      });
      targetElement.innerHTML = html;
    }
  
    // Usage example
    const customHighlightElement = document.getElementById('customHighlight');
    if (customHighlightElement) {
      highlightDifferences(diffData, customHighlightElement);
    }
  }