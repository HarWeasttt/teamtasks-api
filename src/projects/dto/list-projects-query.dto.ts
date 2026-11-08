import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListProjectsQueryDto extends PaginationQueryDto {
  /** case-insensitive search by name */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
