import {
  bishopMove,
  getPossibleBishopMoves,
  getPossibleKingMoves,
  getPossibleKnightMoves,
  getPossiblePawnMoves,
  getPossibleQueenMoves,
  getPossibleRookMoves,
  kingMove,
  knightMove,
  pawnMove,
  queenMove,
  rookMove,
} from "../lib/referee";
import { AllowedMovement, Movement, PieceType, TeamType } from "../types";
import { Piece } from "./piece";
import { Pawn } from "./pieces/pawn";
import { Position } from "./position";

export class Board {
  pieces: Piece[];
  movementDict: Record<PieceType, Movement>;
  possibleMovementDict: Record<PieceType, AllowedMovement>;
  constructor(pieces: Piece[]) {
    this.pieces = pieces;

    this.movementDict = {
      [PieceType.PAWN]: pawnMove,
      [PieceType.KNIGHT]: knightMove,
      [PieceType.BISHOP]: bishopMove,
      [PieceType.ROOK]: rookMove,
      [PieceType.QUEEN]: queenMove,
      [PieceType.KING]: kingMove,
    };

    this.possibleMovementDict = {
      [PieceType.PAWN]: getPossiblePawnMoves,
      [PieceType.KNIGHT]: getPossibleKnightMoves,
      [PieceType.BISHOP]: getPossibleBishopMoves,
      [PieceType.ROOK]: getPossibleRookMoves,
      [PieceType.QUEEN]: getPossibleQueenMoves,
      [PieceType.KING]: getPossibleKingMoves,
    };
  }

  copy(): Board {
    return new Board(this.pieces);
  }

  static CalculateAllMoves(board: Board): Board {
    let updatedPieces = board.pieces.map((piece) => {
      piece.allowedMoves = board.getPossibleMoves(piece);
      return piece;
    });

    board.checkKingMoves(updatedPieces);

    return new Board(updatedPieces);
  }

  checkKingMoves(pieces: Piece[]) {
    const king = pieces.find((piece) => piece.isKing() && piece.team === TeamType.OPPONENT);

    if (king?.allowedMoves.length) {
      // Simula jogada do Rei
      const originalPosition = king.position;

      for (const move of king.allowedMoves) {
        const simulatedBoard = new Board(pieces);

        const pieceAtDestination = simulatedBoard.pieces.find((piece) => piece.samePosition(move));
        // se há uma peça no destino alvo, remover-la
        if (pieceAtDestination) {
          simulatedBoard.pieces = simulatedBoard.pieces.filter((piece) => !piece.samePosition(move));
        }

        // rei sempre está presente no tabuleiro
        const simulatedKing = simulatedBoard.pieces.find((piece) => piece.isKing() && piece.team === TeamType.OPPONENT);
        simulatedKing!.position = move;

        for (const enemy of simulatedBoard.pieces.filter((piece) => piece.team === TeamType.OUR)) {
          enemy.allowedMoves = simulatedBoard.getPossibleMoves(enemy, simulatedBoard.pieces);
        }
        let safe = true;

        // Determina se jogada é safe
        for (const piece of simulatedBoard.pieces) {
          if (piece.team === TeamType.OPPONENT) continue;
          if (piece.isPawn()) {
            const possiblePawnMoves = this.getPossibleMoves(piece, simulatedBoard.pieces);
            // compara jogadas com nova posição do rei
            if (possiblePawnMoves.some((position) => position.x !== piece.position.x && position.samePosition(move))) {
              safe = false;
              break;
            }
          } else if (piece.allowedMoves.some((position) => position.samePosition(move))) {
            safe = false;
            break;
          }
        }

        // remove dos movimentos permitidos
        if (!safe) {
          king.allowedMoves = king.allowedMoves.filter((aMove) => !aMove.samePosition(move));
        }
      }

      king.position = originalPosition;
    }
  }

  getPossibleMoves(piece: Piece, pieces = this.pieces): Position[] {
    return this.possibleMovementDict[piece.type](piece, pieces);
  }

  isValidMove(piecePosition: Position, newPosition: Position, pieceType: PieceType, pieceTeam: TeamType): boolean {
    return this.movementDict[pieceType](piecePosition, newPosition, pieceTeam, this.pieces);
  }

  isEnPassantMove(origin: Position, destination: Position, pieceType: PieceType, pieceTeam: TeamType): boolean {
    const pawnDirection = pieceTeam === TeamType.OUR ? 1 : -1;

    if (pieceType === PieceType.PAWN) {
      if (
        (destination.x - origin.x === -1 || destination.x - origin.x === 1) &&
        destination.y - origin.y === pawnDirection
      ) {
        const target = this.pieces.find(
          (piece) =>
            piece.samePosition(new Position(destination.x, destination.y - pawnDirection)) &&
            piece.isPawn() &&
            piece.enPassant,
        );
        return !!target;
      }
    }

    return false;
  }

  static PlayMove(origin: Position, destination: Position, board: Board, promotionPawn: (piece: Pawn) => void): Board {
    const playedPiece = board.pieces.find((piece) => piece.samePosition(origin));
    if (playedPiece) {
      const newMove = !playedPiece.samePosition(destination);
      if (newMove && playedPiece.allowedMoves.length /* Critério prévio */) {
        const validMove = playedPiece.allowedMoves.some((move) => move.samePosition(destination));
        const enPassantMove = board.isEnPassantMove(
          playedPiece.position,
          destination,
          playedPiece.type,
          playedPiece.team,
        );

        if (enPassantMove) {
          const pawnDirection = playedPiece.team === TeamType.OUR ? 1 : -1;
          const targetPosition = new Position(destination.x, destination.y - pawnDirection);
          const targetPiece = board.pieces.find((piece) => piece.samePosition(targetPosition));

          const piecesUpdated = board.pieces.reduce<Piece[]>((result, pieceInTile) => {
            if (pieceInTile === playedPiece) {
              if (pieceInTile.isPawn()) pieceInTile.enPassant = false;
              pieceInTile.position = destination; // atualiza a posição
              result.push(pieceInTile);
            } else if (pieceInTile !== targetPiece /* filtro do alvo */) {
              if (pieceInTile.isPawn()) pieceInTile.enPassant = false;
              result.push(pieceInTile);
            }
            return result;
          }, []);

          return new Board(piecesUpdated);
        } else if (validMove) {
          const target = board.pieces.find((piece) => piece.samePosition(destination));

          const piecesUpdated = board.pieces.reduce<Piece[]>((result, pieceInTile) => {
            if (pieceInTile === playedPiece) {
              if (playedPiece.isPawn()) {
                // movimento especial
                playedPiece.enPassant = Math.abs(playedPiece.position.y - destination.y) === 2;
                // checa se é promoção pro peão
                const promotionLine = playedPiece.team === TeamType.OUR ? 7 : 0;
                if (destination.y === promotionLine) promotionPawn(playedPiece);
              }
              // atualiza o objeto da posição
              playedPiece.position = destination;
              result.push(playedPiece);
            } else if (pieceInTile !== target /* filtro do alvo */) {
              if (pieceInTile.isPawn()) {
                pieceInTile.enPassant = false;
              }
              result.push(pieceInTile);
            }
            return result;
          }, []);

          return new Board(piecesUpdated);
        }
      }
    }

    return board;
  }

  static PromotePawn(newPieceType: PieceType, pawn: Pawn, board: Board): Board {
    const piecesUpdated = board.pieces.map((piece) => {
      if (pawn.samePiecePosition(piece)) {
        return new Piece(piece.position, newPieceType, piece.team);
      }
      return piece;
    });
    return new Board(piecesUpdated);
  }
}
