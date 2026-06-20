import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ enum: ['chat', 'meeting'] })
  @IsIn(['chat', 'meeting']) mode: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() title?: string;

  @ApiProperty({ type: [String], example: ['CTO'] })
  @IsArray() @IsString({ each: true }) participant_roles: string[];

  @ApiPropertyOptional({ description: 'ISO datetime — untuk mode meeting' })
  @IsOptional() @IsString() scheduled_at?: string;
}

export class SendMessageDto {
  @ApiProperty({ example: 'Matcha kenapa sering error connection ya?' })
  @IsString() message_text: string;
}

export class EndSessionDto {
  @ApiPropertyOptional({ description: 'Ringkasan sesi (opsional)' })
  @IsOptional() @IsString() summary?: string;
}

export class AddFinancialSnapshotDto {
  @ApiProperty({ example: '2026-06-01' }) @IsString() period_start: string;
  @ApiProperty({ example: '2026-06-30' }) @IsString() period_end: string;
  @ApiPropertyOptional() @IsOptional() revenue_total?: number;
  @ApiPropertyOptional() @IsOptional() expense_total?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
