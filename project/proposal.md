lT2216 Assignment 1: Project Idea
=================================

***A go/weiqi/boduk-playing/teaching dialogue system with explanations & demonstrations of English go terminology***

Bill Noble

## Background: What is go?

[Go](https://en.wikipedia.org/wiki/Go_(game)) (also known as _weiqi_ or _baduk_) is an ancient strategy board game for two players
in which players alternate placing black and white stones on the intersections of a grid.
Different sizes of grid can be used, but 19x19, 13x13 and 9x9 are most common.
Points are secured by _capturing_ opponent's stones (by completely surrounding a connected _group_) and 
securing _territory_ (a region of empty intersections in which the opponent cannot possibly play without being captured).

Go is the most played board game in the world, but it is not very well-known in the Europe.
Although the basic rules are very simple, they lead to very complex gameplay,
meaning that there is a rich spectrum of ability levels and play styles across players.

This game is an interesting case study in linguistic terminology. As with many _communities of practice_, 
go-playing communities have a special lexicon of _jargon_ for referring to game-specific concepts.
In the English-language go community, many of these terms are borrowed from Japanese.
Although every turn in go is the same (the player places a stone of their color on the board),
different moves may be described with various ways.

Alpha Go, Katago, teaching applications: AI sensei, Katrain, Lizzie

## System components 

There basic idea is to implement a system that plays go with the user. 
It should display a go board and accept voice commands from the user for where they want play.
In the simplest case, the player (or players) can play both sides or the system can play randomly.

Further features may include:

- More interactive affordances/more natural interaction:
  - _Oops can I take that move back?_
  - _Sorry I meant *C14* not *C13*._
  - _Let's start over?_
  - _Can I play as black this time?_
  - Instead of a coordinate command like _B6_:
    - Player: _I'll **wedge**._
    - System: _You want to **wedge** at *B6*?_
    - Player: _Yes._
- Integration with variable-strength AI players
- Teaching modules:
  - basic rules: legal moves, passing
  - how to count points
  - *the rule of ko*
  - basic strategic concepts
- Go terminology: A terminology-teaching routine may be entered through a clarification request (Player _What does **tenuki** mean_?)
- Commentary on player moves (System: _That was a somewhat **slow** move. Why don't you try **cutting** instead?_ Player: Ok, let's try it.)
- Exploring branching game possibilities
- Playing _tsumego_ (go puzzles)

## Terminology // move descriptors  

Some terms for go moves like **cut**, **wedge**, **kosumi** have straight-forward definitions that depend on the move's positional
relation to nearby stones.
Others are more judgement-based and may need to take the broader board position into account.
Recognizing whether a move can be described as a **pincer**, an **extension**, an **attachment**, an **invasion**, a **tenuki**, etc.
is entirely non-trivial.
Similarly, moves may be described as **slow**, or as an **under-play** or **over-play**, depending on the move's strategic value
in the overall game.
Even certain straight-forward move descriptors can have less-than-literal interpretations:
Technically, two stones are **connected** if they are orthogonally adjacent.
But stones that can not be profitably **cut** by the opponent (for example because of to surrounding **influence**)
may also be described as connected.

## Data / machine learning

This opens up the possibility for some multi-modal machine learning.
Can we train a language model that can ground some of these go terms in board positions?
It may be possible to scrape an internet corpus that can be used to train such a model.
Go forums (and wikis) often have special syntax for displaying board positions.
A normalized/featurized version of the board along with the accompanying text may constitute
an interesting data source for training a contextualized language model.

- [Sensei's Library](https://senseis.xmp.net/?HowDiagramsWork)
- [Life in 19x19](https://www.lifein19x19.com/viewtopic.php?f=5&t=226)
- Corpora of go commentaries?

## Possible experiments

- What strategies are best for teaching go terminology to beginners? How do visual demonstrations augment linguistic description?
- How can follow-up questions / clarification requests be accomodated?

